#!/usr/bin/env node
// 连载编校命令行：
//   node tools/desk-cli.mjs catalog <地区> [时刻]
//   node tools/desk-cli.mjs review  <地区> <译稿id>
//   node tools/desk-cli.mjs corpus  <地区> <译稿id...>
//   node tools/desk-cli.mjs replay  <地区> [时刻]
//   node tools/desk-cli.mjs prereq  <地区>
//   node tools/desk-cli.mjs withdraw <地区> <撤下发行id>
//   node tools/desk-cli.mjs approve <地区> <译稿id>
//   node tools/desk-cli.mjs wording <原作锚点>
import { readBundle } from './materials.mjs';
import { reviewPiece, reviewCorpus, summarize } from './review.mjs';
import {
  availableAnchorsFor, evaluateAllPrerequisites, withdrawalCascade,
} from './visibility.mjs';
import { readerCatalog, assertNoEditorLeak } from './catalog.mjs';
import { replay } from './replay.mjs';
import { approveRevision, compareRegionalWordings } from './desk.mjs';

const bundle = readBundle();
const [command, ...args] = process.argv.slice(2);

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const now = '2026-11-20T18:00:00+08:00';

switch (command) {
  case 'catalog': {
    const [region, at = now] = args;
    print({ leakCheck: assertNoEditorLeak(bundle, region, at), ...readerCatalog(bundle, region, at) });
    break;
  }
  case 'review': {
    const [region, pieceId, at = now] = args;
    const piece = bundle.translations.find(item => item.id === pieceId);
    const findings = reviewPiece(bundle, piece, { availableAnchors: availableAnchorsFor(bundle, region, at) });
    print({ pieceId, region, counts: summarize(findings), findings });
    break;
  }
  case 'corpus': {
    const [region, ...ids] = args;
    print(reviewCorpus(bundle, region, ids, { availableAnchors: availableAnchorsFor(bundle, region, now) }));
    break;
  }
  case 'replay': {
    const [region, at = now] = args;
    print(replay(bundle, region, at));
    break;
  }
  case 'prereq': {
    print(evaluateAllPrerequisites(bundle, args[0], now));
    break;
  }
  case 'withdraw': {
    const [region, issueId, at = now] = args;
    print(withdrawalCascade(bundle, region, issueId, at));
    break;
  }
  case 'approve': {
    const [region, pieceId, at = now] = args;
    print(approveRevision(bundle, region, pieceId, at));
    break;
  }
  case 'wording': {
    print(compareRegionalWordings(bundle, args[0], now));
    break;
  }
  default:
    process.stderr.write('未知命令；可用：catalog review corpus replay prereq withdraw approve wording\n');
    process.exitCode = 1;
}
