(function(){
var P=window.__PAGE, root=document.getElementById('root'), inst, scheduled=false;
function DCLogic(){this.props={};}
DCLogic.prototype.setState=function(p){this.state=Object.assign({},this.state,p);schedule();};
function schedule(){ if(scheduled) return; scheduled=true; Promise.resolve().then(function(){scheduled=false;rerender();}); }
function lookup(path,scope){var parts=path.trim().split('.');var v=scope[parts[0]];for(var i=1;i<parts.length;i++){v=(v===undefined||v===null)?undefined:v[parts[i]];}return v;}
var WHOLE=/^\s*\{\{([^}]+)\}\}\s*$/;
function inner(str){var m=WHOLE.exec(str);return m?m[1]:str;}
function interp(str,scope){return str.replace(/\{\{([^}]+)\}\}/g,function(_,e){var v=lookup(e,scope);return (v===undefined||v===null||typeof v==='function'||v===false&&false)?'':String(v);});}
var BOOL={disabled:1,selected:1,checked:1,hidden:1,readonly:1,required:1};
// Trang admin: đổi màu cố định cũ sang biến theme (P.theme = {hex: tên biến}); vùng data-raw giữ nguyên màu.
var TM=P.theme||null,rawDepth=0,HEX=/#([0-9a-f]{6})([0-9a-f]{2})?(?![0-9a-z])/gi;
function themed(s){
 if(!TM||rawDepth||!s)return s;
 s=s.replace(HEX,function(m,h,a){var t=TM[h.toUpperCase()];if(!t)return m;if(!a)return 'var(--'+t+')';
  return 'color-mix(in srgb,var(--'+t+') '+Math.round(parseInt(a,16)/2.55)+'%,transparent)';});
 if(TM.$)Object.keys(TM.$).forEach(function(k){s=s.split(k).join(TM.$[k]);});
 return s;
}
if(TM)Array.prototype.forEach.call(document.querySelectorAll('head style'),function(st){st.textContent=themed(st.textContent);});
function build(nodes,scope,out){
 for(var i=0;i<nodes.length;i++){var n=nodes[i];
  if(n.nodeType===3){var tx=interp(n.data,scope);out.appendChild(document.createTextNode(out.nodeName==='STYLE'?themed(tx):tx));continue;}
  if(n.nodeType!==1) continue;
  if(n.tagName==='TEMPLATE'&&n.getAttribute('data-tag')){
   var tag=n.getAttribute('data-tag');
   if(tag==='sc-for'){var list=lookup(inner(n.getAttribute('list')),scope)||[];var as=n.getAttribute('as');
    list.forEach(function(item){var s2=Object.assign({},scope);s2[as]=item;build(n.content.childNodes,s2,out);});}
   else{var v=lookup(inner(n.getAttribute('value')),scope);if(v)build(n.content.childNodes,scope,out);}
   continue;}
  var el=n.cloneNode(false);
  Array.prototype.slice.call(n.attributes).forEach(function(a){
   var name=a.name,val=a.value;
   if(name.indexOf('hint-')===0){el.removeAttribute(name);return;}
   if(val.indexOf('{{')<0) return;
   if(name.indexOf('on')===0){el.removeAttribute(name);var fn=lookup(inner(val),scope);
   if(typeof fn==='function'){var ev=name==='onclick'?'click':((el.tagName==='SELECT'||el.type==='file'||el.type==='date')?'change':'input');if(ev==='input'){el.addEventListener('input',function(e){if(e.isComposing)return;fn(e);});el.addEventListener('compositionend',function(e){fn(e);});}else{el.addEventListener(ev,function(e){fn(e);});}}
    return;}
   var raw=WHOLE.test(val)?lookup(inner(val),scope):interp(val,scope);
   if(BOOL[name]){if(raw&&raw!=='false')el.setAttribute(name,'');else el.removeAttribute(name);return;}
   el.setAttribute(name,(raw===undefined||raw===null)?'':String(raw));
  });
  var isRaw=TM&&n.hasAttribute('data-raw');if(isRaw)rawDepth++;
  if(TM&&!rawDepth)['style','fill','stroke'].forEach(function(a){if(el.hasAttribute(a))el.setAttribute(a,themed(el.getAttribute(a)));});
  build(n.childNodes,scope,el);
  if(isRaw)rawDepth--;
  if((el.tagName==='SELECT'||el.tagName==='TEXTAREA')&&el.hasAttribute('value'))el.value=el.getAttribute('value');
  out.appendChild(el);
 }
}
function rerender(){
 var sel='input,textarea,select,button';var ae=document.activeElement,idx=-1,ss=null,se=null;
 if(ae&&ae!==document.body&&root.contains(ae)){idx=Array.prototype.indexOf.call(root.querySelectorAll(sel),ae);try{ss=ae.selectionStart;se=ae.selectionEnd;}catch(x){}}
 var sy=document.documentElement.scrollTop,sx=document.documentElement.scrollLeft;
 var kp=Array.prototype.map.call(root.querySelectorAll('[data-keep]'),function(e){return e.scrollTop;});
 var vals=inst.renderVals();
 var tpl=document.createElement('template');tpl.innerHTML=P.tpl;
 var frag=document.createDocumentFragment();
 build(tpl.content.childNodes,vals,frag);
 root.replaceChildren(frag);
 Array.prototype.forEach.call(root.querySelectorAll('[data-keep]'),function(e,k){e.scrollTop=kp[k]||0;});
 if(idx>=0){var el=root.querySelectorAll(sel)[idx];if(el){el.focus({preventScroll:true});try{if(ss!==null)el.setSelectionRange(ss,se);}catch(x){}}}
 document.documentElement.scrollTop=sy;document.documentElement.scrollLeft=sx;
}
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var h=a.getAttribute('href')||'';
 var m=h.match(/^([A-Za-z0-9_]+)\.dc\.html(#.*)?$/);
 if(m){e.preventDefault();parent.postMessage({go:m[1],hash:m[2]||''},'*');}
 else if(h.charAt(0)==='#'){e.preventDefault();var t=h.length>1&&document.getElementById(h.slice(1));if(t)t.scrollIntoView();}
});
var C=new Function('DCLogic',P.script+';return Component;')(DCLogic);
inst=new C();inst.state=inst.state||{};inst.props=Object.assign({},P.props);
rerender();
if(inst.mount)inst.mount();
window.SONNA_REFRESH=function(){schedule();};
if(P.hash&&P.hash.length>1){var t=document.getElementById(P.hash.slice(1));if(t)t.scrollIntoView();}
})();
