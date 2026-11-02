import test from'node:test';import assert from'node:assert/strict';import {publicVideoMetadata}from'./public-video-metadata.mjs';
test('the reported Italian listing becomes audience copy with a website invitation',()=>{
 const input={title:'Italy Tuscan Hills Rush | 12 Countries | 4K60 Review',description:'Choose your country before the lights go out!\n\nBack Italy, Poland and Ireland.\n\nNative 3840 x 2160, 60 fps. Unlisted review copy. Fictional stylised Italian circuit.',tags:['Italy','unlisted review','4K60'],privacy:'unlisted',userValidation:'pending'};
 const before=JSON.stringify(input),out=publicVideoMetadata(input);assert.doesNotMatch(out.description,/Native 3840|Unlisted|Fictional stylised/);assert.match(out.description,/Explore more.*https:\/\/marbleformula.com/);assert.match(out.description,/Back Italy, Poland and Ireland/);assert.equal(out.title,'Italy Tuscan Hills Rush | 12 Countries | 4K60');assert.deepEqual(out.tags,['Italy','4K60']);assert.equal(out.privacy,'unlisted');assert.equal(out.userValidation,'pending');assert.equal(JSON.stringify(input),before);
});
test('normalization is idempotent and keeps chapters, results and existing audience copy',()=>{
 const a=publicVideoMetadata({title:'Marble Race',description:'Choose a country!\n\nChapters\n0:00 Start\n2:30 Finish\n\nResults\n1. Italy\n\n#marblerace'}),b=publicVideoMetadata(a);assert.deepEqual(a,b);assert.equal((b.description.match(/https:\/\/marbleformula.com/g)||[]).length,1);assert.match(b.description,/0:00 Start\n2:30 Finish/);assert.match(b.description,/1\. Italy/);
});
test('old repair commentary is kept out of the audience description',()=>{
 const a=publicVideoMetadata({title:'Swiss Alps | Review',description:'Unlisted review of the Swiss Alps race.\n\nOriginal fixed seed34 physics and results preserved; camera-only repair. Native 3840x2160 at 60fps. For user review; public release and Cloud archival remain pending.'});assert.match(a.description,/Watch Swiss Alps race/);assert.doesNotMatch(a.description,/seed34|camera-only|Cloud archival|Native|user review/);
});
test('compact technical notes, decimal durations and review-only sentences disappear completely',()=>{
 const a=publicVideoMetadata({title:'Race',description:'Pick your country. Fixed sequential seed45; no winner selection. Native3840x2160 at60fps, full111.92-second master. User review pending before public release or Cloud archival.\n\nFictional stylised British circuit.\n\nUnlisted Marble Formula review. This independent review preserves official championship qualifiers.'});assert.doesNotMatch(a.description,/Native|seed45|111|92-second|approval|archival|Fictional|Unlisted|qualifiers/);assert.match(a.description,/Pick your country/);
});
