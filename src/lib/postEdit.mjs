export function preparePostEdit(post, uid, expectedText, draft) {
 if (!uid || !post || post.authorId !== uid) throw Error('post-edit-unavailable');
 if (post.text !== expectedText) throw Error('post-edit-conflict');
 const text = draft.trim();
 if (text.length > 2000 || (!text && !post.imageUrl && !post.videoUrl)) throw Error('post-edit-invalid');
 return text;
}
