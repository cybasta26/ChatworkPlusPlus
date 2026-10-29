export function parseMessageLink(value){
 try{const url=new URL(value.trim());const match=/^#!?rid(\d+)-(\d+)$/.exec(url.hash);
 if(url.protocol!=='https:'||!['www.chatwork.com','chatwork.com'].includes(url.hostname)||url.port||url.username||url.password||url.pathname!=='/'||!match)return null;
 return {origin:url.origin,roomId:match[1],id:match[2]};}catch{return null;}
}
