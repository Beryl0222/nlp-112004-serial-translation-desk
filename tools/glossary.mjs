// 编校部维护的跨语言词面表：把用语表中的真名、称谓映射到各语种译稿里实际出现的词面。
// 这是编校配置而不是来件资料；lexicon.editorOnly 的背景说明只能留在编辑侧结论里，
// 绝不写进读者目录输出。

const actorSurfaces = {
  en: { 韩芦: ['Han Lu', 'Han'] },
  es: { 韩芦: ['Han Lu'] },
  zh: { 韩芦: ['韩芦'] },
};

const handleSurfaces = {
  en: {
    芦: ['Reed'],
    看灯人: ['lamplighter'],
    副手: ['deckhand'],
    掌灯的: ['the one on duty'],
  },
  es: {
    芦: ['Junco'],
    看灯人: ['guardafarol'],
    副手: ['ayudante'],
    掌灯的: ['la persona de guardia'],
  },
  zh: {}, // 中文原稿直接按称谓本面匹配
};

// 原作明示「仍有多解」的语句，以及各语种保留该线索时应出现的说法。
export const ambiguityPhrases = [
  { marker: '不只一位', en: ['more than one'], es: ['más de un'], zh: ['不只一位'] },
  { marker: '不能排除', en: ['rule out'], es: ['descartar'], zh: ['不能排除'] },
];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findSurfaces(text, surfaces, language) {
  const latin = language !== 'zh';
  const haystack = latin ? text.toLowerCase() : text;
  const hits = [];
  for (const surface of surfaces) {
    const needle = latin ? surface.toLowerCase() : surface;
    const pattern = latin ? `\\b${escapeRegExp(needle)}\\b` : escapeRegExp(needle);
    const regex = new RegExp(pattern, 'g');
    let match;
    while ((match = regex.exec(haystack)) !== null) {
      hits.push({ surface, index: match.index, length: needle.length });
    }
  }
  // Han 落在 Han Lu 之内时只保留更长的那次匹配
  return hits
    .filter(hit => !hits.some(other =>
      other !== hit
      && other.index <= hit.index
      && other.index + other.length >= hit.index + hit.length))
    .sort((a, b) => a.index - b.index);
}

// 依据用语表构造某语种的扫描器：译稿/原文句子拆合后仍可逐面核对称谓与真名。
export function makeScanner(lexicon, language) {
  const actorByHandle = new Map();
  for (const entry of lexicon) {
    for (const handle of entry.handles) actorByHandle.set(handle, entry.actor);
  }
  const actorTable = actorSurfaces[language] ?? {};
  const handleTable = handleSurfaces[language] ?? {};

  return function scan(text) {
    const actors = [];
    for (const [actor, surfaces] of Object.entries(actorTable)) {
      for (const hit of findSurfaces(text, surfaces, language)) {
        actors.push({ actor, surface: hit.surface, index: hit.index });
      }
    }
    const handles = [];
    for (const [handle, surfaces] of Object.entries(handleTable)) {
      for (const hit of findSurfaces(text, surfaces, language)) {
        handles.push({ handle, actor: actorByHandle.get(handle) ?? null, surface: hit.surface, index: hit.index });
      }
    }
    // 中文兜底：用语表中的称谓本面直接在原句里找
    if (language === 'zh') {
      for (const handle of actorByHandle.keys()) {
        let at = text.indexOf(handle);
        while (at !== -1) {
          handles.push({ handle, actor: actorByHandle.get(handle), surface: handle, index: at });
          at = text.indexOf(handle, at + handle.length);
        }
      }
    }
    const ambiguity = [];
    for (const phrase of ambiguityPhrases) {
      for (const local of phrase[language] ?? []) {
        const haystack = language === 'zh' ? text : text.toLowerCase();
        const needle = language === 'zh' ? local : local.toLowerCase();
        let at = haystack.indexOf(needle);
        while (at !== -1) {
          ambiguity.push({ marker: phrase.marker, phrase: local, index: at });
          at = haystack.indexOf(needle, at + needle.length);
        }
      }
    }
    return {
      actors: actors.sort((a, b) => a.index - b.index),
      handles: handles.sort((a, b) => a.index - b.index),
      ambiguity: ambiguity.sort((a, b) => a.index - b.index),
    };
  };
}

// 原稿里把职务当泛称用的口吻信号（如 c21「管值班的都这么叫」）。
export function isGenericHandleSource(sourceText) {
  return /都|任何|谁/.test(sourceText);
}
