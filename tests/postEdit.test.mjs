import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preparePostEdit} from '../src/lib/postEdit.mjs';
const post={authorId:'alice',text:'Original',imageUrl:''};
test('editing requires existing owned post and unchanged original caption',()=>{
 for(const [value,uid] of [[post,'bob'],[post,null],[undefined,'alice']])assert.throws(()=>preparePostEdit(value,uid,'Original','New'),/unavailable/);
 assert.throws(()=>preparePostEdit({...post,text:'Other device'},'alice','Original','New'),/conflict/);
 assert.equal(preparePostEdit(post,'alice','Original','  New عربي  '),'New عربي');
 assert.equal(post.text,'Original');
});
test('caption removal is allowed only with media; oversized edits are rejected',()=>{
 assert.throws(()=>preparePostEdit(post,'alice','Original','   '),/invalid/);
 assert.throws(()=>preparePostEdit(post,'alice','Original','x'.repeat(2001)),/invalid/);
 for(const media of [{imageUrl:'photo'},{videoUrl:'clip'}])assert.equal(preparePostEdit({...post,...media},'alice','Original',' '),'');
 assert.equal(preparePostEdit(post,'alice','Original','x'.repeat(2000)).length,2000);
});
