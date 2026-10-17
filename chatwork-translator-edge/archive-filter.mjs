export function ranges(text,keyword,matchCase=false,whole=false){
 if(!keyword)return [];const escaped=keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const re=new RegExp(escaped,matchCase?'gu':'giu'),out=[];
 for(const m of text.matchAll(re)){const before=Array.from(text.slice(0,m.index)).pop()||'',after=Array.from(text.slice(m.index+m[0].length))[0]||'';
 if(whole&&(/[\p{L}\p{N}_]/u.test(before)||/[\p{L}\p{N}_]/u.test(after)))continue;out.push([m.index,m.index+m[0].length]);}return out;
}
export function matches(m,o){
 const sender=!o.sender||String(m.sender)===o.sender,recipient=!o.recipient||[...(m.to||[]),...(m.re||[])].some(id=>String(id)===o.recipient);
 const member=o.sender&&o.recipient?(o.both?sender&&recipient:sender||recipient):sender&&recipient;
 return member&&(!o.keyword||ranges([m.text,m.senderName,...(m.files||[]).map(f=>f.name)].join('\n'),o.keyword,o.matchCase,o.whole).length>0);
}
