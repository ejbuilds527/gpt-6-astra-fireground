import { assembleFacts, assembleAdversarialRubric } from './lib/facts';
async function main() {
  const facts = await assembleFacts();
  const ids = Object.keys(facts);
  console.log('fact count', ids.length);
  for (const id of ['F.SITE.drive_side_of_street','F.RT.dump.crossing_note','F.RT.dump.correction']) {
    console.log(id, '=', JSON.stringify(facts[id]?.value)?.slice(0,70), '|', facts[id]?.source.slice(0,150));
  }
  console.log('nulls:', ids.filter(i => facts[i].value === null).length, 'of', ids.length);
  console.log('answer key in pack:', JSON.stringify(facts).includes('worked_answer'));
  console.log('reviewer checks', (await assembleAdversarialRubric()).length);
}
main().catch(e => { console.error('FAILED', e.message); process.exit(1); });
