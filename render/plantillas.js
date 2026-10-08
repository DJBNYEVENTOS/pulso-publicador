// Plantillas de Pulso. Mismo código que dibuja los diseños en la app.
function wrap(ctx,text,maxW){
  var words=String(text||'').split(/\s+/).filter(Boolean),lines=[],cur='';
  words.forEach(function(w){var t=cur?cur+' '+w:w;if(ctx.measureText(t).width>maxW&&cur){lines.push(cur);cur=w}else cur=t});
  if(cur)lines.push(cur);return lines;
}
function fitText(ctx,text,font,maxW,maxH,start,min,lh){
  var size=start,lines;
  for(;size>=min;size-=4){ctx.font=font.replace('{s}',size);lines=wrap(ctx,text,maxW);if(lines.length*size*lh<=maxH)break}
  return {size:Math.max(size,min),lines:lines||[]};
}
function lum(hex){var h=String(hex||'#000').replace('#','');if(h.length===3)h=h.replace(/./g,'$&$&');var r=parseInt(h.substr(0,2),16)/255,g=parseInt(h.substr(2,2),16)/255,b=parseInt(h.substr(4,2),16)/255;return 0.2126*r+0.7152*g+0.0722*b}
function onColor(hex,m){return lum(hex)>0.55?(m.colorTexto||'#111'):'#FFFFFF'}
function drawDesign(cv,d,m,img){
  var W=1080,H=d.size==='historia'?1920:d.size==='vertical'?1350:1080;
  cv.width=W;cv.height=H;
  var c=cv.getContext('2d');c.textBaseline='alphabetic';
  var tf=m.fuenteTitulo,bf=m.fuenteTexto,P=m.colorPrincipal,A=m.colorAcento,F=m.colorFondo,T=m.colorTexto,G=m.colorDetalle||A;
  var est=m.estilo||'nocturno',tpl=(d.plantilla==='foto'&&!img)?'impacto':(d.plantilla||'impacto'),titular=d.titular||'Tu titular aquí',sub=d.subtitulo||'',cta=d.sinCta?'':(d.cta||m.cta||'');
  var BNY=est==='bny';if(BNY){est='nocturno';G=A;}var INV=est==='invitaciones';if(INV){est='editorial';}var lf=m.fuenteEtiqueta||bf,LOGO=m.logoImg||null;
  var CEN=est==='editorial'||est==='romantico';
  var M=est==='nocturno'?112:96, X=CEN?W/2:M, TW=W-2*M;
  var tW=est==='nocturno'?'italic 500':(est==='romantico'?'italic 500':(est==='editorial'?'500':'400'));
  if(est==='tecnico')tW='400';
  c.textAlign=CEN?'center':'left';
  function bg(col){c.fillStyle=col;c.fillRect(0,0,W,H)}
  function cover(im,x,y,w,h){var r=Math.max(w/im.width,h/im.height),iw=im.width*r,ih=im.height*r;c.save();c.beginPath();c.rect(x,y,w,h);c.clip();c.drawImage(im,x+(w-iw)/2,y+(h-ih)/2,iw,ih);c.restore()}
  function lines(L,y,size,lh,col,font){c.font=font;c.fillStyle=col;L.forEach(function(l,i){c.fillText(l,X,y+i*size*lh)});return y+(L.length-1)*size*lh}
  function spaced(txt,x,y,size,col,font,track){c.save();c.font=font.replace('"'+bf+'"','"'+lf+'"');c.fillStyle=col;var chars=String(txt).toUpperCase().split(''),w=0;chars.forEach(function(ch){w+=c.measureText(ch).width+track});w-=track;var sx=CEN?x-w/2:x;c.textAlign='left';chars.forEach(function(ch){c.fillText(ch,sx,y);sx+=c.measureText(ch).width+track});c.restore()}
  function ctaPill(y,bgc,fg){if(!cta)return y;c.save();c.font='700 32px "'+lf+'"';c.textAlign='left';var w=c.measureText(cta).width+80,x=CEN?(W-w)/2:M;
    if(est==='nocturno'||est==='editorial'){c.strokeStyle=bgc;c.lineWidth=2;roundRect(c,x,y,w,84,est==='editorial'?0:42);c.stroke();c.fillStyle=bgc}else{c.fillStyle=bgc;roundRect(c,x,y,w,84,est==='tecnico'?18:42);c.fill();c.fillStyle=fg}
    c.fillText(cta,x+40,y+54);c.restore();return y+84}
  function ornaments(dark){
    if(est==='nocturno'){
      var g=c.createRadialGradient(W*0.85,H*0.08,10,W*0.85,H*0.08,W*0.9);g.addColorStop(0,hexA(A,dark?0.45:0.18));g.addColorStop(1,hexA(A,0));c.fillStyle=g;c.fillRect(0,0,W,H);
      c.strokeStyle=hexA(G,0.75);c.lineWidth=2;c.strokeRect(44,44,W-88,H-88);
      spaced('Experiencia BNY',M,M+30,24,G,'600 24px "'+bf+'"',7);
    } else if(est==='tecnico'){
      c.save();c.fillStyle=hexA(dark?'#FFFFFF':T,0.06);for(var gx=48;gx<W;gx+=48)for(var gy=48;gy<H;gy+=48){c.beginPath();c.arc(gx,gy,2.2,0,6.29);c.fill()}c.restore();
      c.save();c.translate(W-150,150);c.rotate(20*Math.PI/180);c.fillStyle=A;roundRect(c,-62,-62,124,124,26);c.fill();c.restore();
    } else if(est==='editorial'){
      c.fillStyle=G;c.fillRect(W/2-60,M,120,2);if(!LOGO)c.fillRect(W/2-60,H-M-70,120,2);
      spaced(m.etiqueta||m.nombre||'',W/2,M+56,22,dark?'#FFFFFF':T,'600 22px "'+bf+'"',9);
    } else if(est==='romantico'){
      c.save();c.strokeStyle=hexA(G,0.9);c.lineWidth=2;var aw=W-2*M,ax=M,ay=M,ah=H-2*M;c.beginPath();c.moveTo(ax,ay+ah);c.lineTo(ax,ay+aw/2);c.arc(W/2,ay+aw/2,aw/2,Math.PI,0);c.lineTo(ax+aw,ay+ah);c.stroke();c.restore();
    }
  }
  function foot(col){
    c.save();
    if(LOGO){var LG=(lum(col)>0.55&&m.logoClaroImg)?m.logoClaroImg:LOGO,lh=BNY?86:(INV?118:70),lw=LG.width*lh/LG.height,ly=H-M-lh+(INV?-10:14),lx=CEN?(W-lw)/2:M;if(lum(col)>0.55&&LG===LOGO){c.fillStyle=F;roundRect(c,lx-18,ly-14,lw+36,lh+28,10);c.fill()}c.drawImage(LG,lx,ly,lw,lh);if(m.firma&&!CEN){c.font='italic 400 28px "'+tf+'"';c.fillStyle=lum(col)>0.55?'#FFFFFF':A;c.textAlign='right';c.fillText(m.firma,W-M,H-M+4)}}
    else if(est==='nocturno'){spaced(m.nombre||'',M,H-M+4,26,col,'700 26px "'+bf+'"',6);if(m.firma){c.font='italic 400 26px "'+tf+'"';c.fillStyle=hexA(G,0.95);c.textAlign='right';c.fillText(m.firma,W-M,H-M+4)}}
    else if(est==='editorial'){if(m.firma){c.font='italic 400 28px "'+tf+'"';c.fillStyle=col;c.fillText(m.firma,W/2,H-M-20)}}
    else if(est==='romantico'){spaced(m.nombre||'',W/2,H-M-36,22,col,'500 22px "'+bf+'"',8)}
    else {c.font='800 34px "'+bf+'"';c.fillStyle=col;c.fillText(m.nombre||'',M,H-M+6);if(m.firma){c.font='500 24px "'+bf+'"';c.globalAlpha=.75;c.fillText(m.firma,M,H-M+44)}}
    c.restore();
  }
  var dark=true,fg='#FFFFFF',y;
  if(tpl==='impacto'){
    var BGI=BNY?F:P;bg(BGI);dark=lum(BGI)<0.55;fg=BNY?T:onColor(P,m);ornaments(dark);
    var FR=LOGO?(INV?200:150):110,tTop=INV?0.2:(CEN?0.34:0.32);
    var tMax=INV?H*0.34:H*0.46,t,sP;for(var k=0;k<6;k++){t=fitText(c,titular,tW+' {s}px "'+tf+'"',TW,tMax,H>1200?150:(INV?104:128),52,1.06);if(INV)break;var yE=H*tTop+t.size+(t.lines.length-1)*t.size*1.06+64;if(sub){sP=fitText(c,sub,'400 {s}px "'+bf+'"',TW,200,40,24,1.4);yE+=18+(sP.lines.length-1)*sP.size*1.4+70}if(yE<=H-M-200)break;tMax*=0.85;tTop=Math.max(0.2,tTop-0.04)}
    y=H*tTop+t.size;y=lines(t.lines,y,t.size,1.06,fg,tW+' '+t.size+'px "'+tf+'"')+64;
    if(est==='nocturno'||est==='editorial'){c.fillStyle=G;c.fillRect(CEN?W/2-40:M,y-28,80,3)}
    if(sub){var s=fitText(c,sub,'400 {s}px "'+bf+'"',TW,INV?110:200,INV?34:40,24,1.4);y=lines(s.lines,y+18,s.size,1.4,hexA(fg,0.86),'400 '+s.size+'px "'+bf+'"')+(INV?54:70)}
    if(!INV)ctaPill(Math.min(y,H-M-200),est==='nocturno'?G:A,onColor(A,m));else if(y+84<=H-M-FR)ctaPill(y,A,onColor(A,m));foot(fg);
  } else if(tpl==='cita'){
    bg(est==='nocturno'?P:F);dark=est==='nocturno';fg=dark?'#FFFFFF':T;ornaments(dark);
    c.fillStyle=G;c.font='italic 400 300px "'+tf+'"';c.fillText('“',CEN?W/2:M-14,H*(est==='tecnico'?0.30:0.37));
    var t2=fitText(c,titular,'italic 500 {s}px "'+tf+'"',TW,H*0.4,H>1200?118:92,46,1.16);
    y=H*0.42+t2.size;y=lines(t2.lines,y,t2.size,1.16,fg,'italic 500 '+t2.size+'px "'+tf+'"')+80;
    if(sub){var s2=fitText(c,sub,'500 {s}px "'+bf+'"',TW,180,32,24,1.4);spaced(s2.lines.join(' ').slice(0,60),X,y,22,dark?G:A,'600 22px "'+bf+'"',4)}
    foot(fg);
  } else if(tpl==='oferta'){
    bg(F);dark=false;var ph=Math.round(H*(H>1200?0.5:0.4));
    if(img)cover(img,0,0,W,ph);else{c.fillStyle=P;c.fillRect(0,0,W,ph);var ex=est;if(ex==='nocturno'||ex==='tecnico'){var keepH=H;H=ph;ornaments(true);H=keepH;if(LOGO){var blh=ph*0.3,blw=LOGO.width*blh/LOGO.height;c.fillStyle=F;roundRect(c,(W-blw)/2-36,ph/2-blh/2-26,blw+72,blh+52,14);c.fill();c.drawImage(LOGO,(W-blw)/2,ph/2-blh/2,blw,blh);var LOGOTOP=true}}else if(LOGO){var LGo=(lum(P)<0.55&&m.logoClaroImg)?m.logoClaroImg:LOGO,ohh=ph*0.62,oww=LGo.width*ohh/LGo.height;c.drawImage(LGo,(W-oww)/2,(ph-ohh)/2,oww,ohh);var LOGOTOP=true}else{c.save();c.font='italic 500 '+Math.round(ph*0.22)+'px "'+tf+'"';c.fillStyle=hexA(G,0.9);c.textAlign='center';c.fillText(m.nombre||'',W/2,ph*0.58);c.restore()}}
    c.fillStyle=est==='nocturno'?G:A;c.fillRect(0,ph,W,est==='editorial'?2:10);
    var t3=fitText(c,titular,tW+' {s}px "'+tf+'"',TW,H*0.2,H>1200?112:84,44,1.06);
    y=ph+76+t3.size;y=lines(t3.lines,y,t3.size,1.06,T,tW+' '+t3.size+'px "'+tf+'"')+56;
    if(sub){var s3=fitText(c,sub,'400 {s}px "'+bf+'"',TW,130,34,24,1.35);y=lines(s3.lines,y,s3.size,1.35,hexA(T,0.85),'400 '+s3.size+'px "'+bf+'"')+40}
    if(y+84<H-80)ctaPill(y,P,onColor(P,m));
    if(LOGO&&typeof LOGOTOP==='undefined'){var olh=64,olw=LOGO.width*olh/LOGO.height;c.drawImage(LOGO,CEN?(W-olw)/2:W-M-olw,H-48-olh,olw,olh)}else if(!LOGO){c.save();c.font='700 26px "'+lf+'"';c.fillStyle=hexA(T,0.7);c.textAlign=CEN?'center':'right';c.fillText(String(m.nombre||'').toUpperCase(),CEN?W/2:W-M,H-56);c.restore();}
  } else if(tpl==='tip'){
    bg(est==='nocturno'?P:F);dark=est==='nocturno';fg=dark?'#FFFFFF':T;ornaments(dark);
    var lab=d.etiqueta?d.etiqueta:m.etiquetaTip?m.etiquetaTip:INV?'Para anfitriones':est==='nocturno'?'Secreto de cabina':est==='editorial'?'Para planners':est==='tecnico'?'Tip de negocio':'Detalle';
    spaced(lab,X,M+(est==='nocturno'?110:est==='editorial'?150:60),26,est==='nocturno'?G:A,'700 26px "'+bf+'"',6);
    var t4=fitText(c,titular,tW+' {s}px "'+tf+'"',TW,H*0.38,H>1200?120:98,46,1.08);
    y=M+(est==='editorial'?260:220)+t4.size;y=lines(t4.lines,y,t4.size,1.08,fg,tW+' '+t4.size+'px "'+tf+'"')+70;
    if(sub){c.fillStyle=hexA(est==='nocturno'?G:A,0.8);c.fillRect(CEN?W/2-TW/2:M,y-34,TW,2);var s4=fitText(c,sub,'400 {s}px "'+bf+'"',TW,260,40,26,1.42);lines(s4.lines,y+26,s4.size,1.42,hexA(fg,0.88),'400 '+s4.size+'px "'+bf+'"')}
    foot(fg);
  } else {
    if(img)cover(img,0,0,W,H);else bg(P);
    var g=c.createLinearGradient(0,H*0.3,0,H);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.82)');c.fillStyle=g;c.fillRect(0,0,W,H);
    if(est==='nocturno'){c.strokeStyle=hexA(G,0.75);c.lineWidth=2;c.strokeRect(44,44,W-88,H-88);spaced('Experiencia BNY',M,M+30,24,G,'600 24px "'+bf+'"',7)}
    var t5=fitText(c,titular,tW+' {s}px "'+tf+'"',TW,H*0.28,H>1200?124:100,46,1.06);
    var blockH=t5.lines.length*t5.size*1.06+(sub?110:0)+(cta?140:0);
    y=H-M-90-blockH+t5.size;y=lines(t5.lines,y,t5.size,1.06,'#FFFFFF',tW+' '+t5.size+'px "'+tf+'"')+60;
    if(sub){var s5=fitText(c,sub,'400 {s}px "'+bf+'"',TW,100,34,24,1.35);y=lines(s5.lines,y,s5.size,1.35,'rgba(255,255,255,.88)','400 '+s5.size+'px "'+bf+'"')+50}
    ctaPill(y,est==='nocturno'?G:A,onColor(A,m));foot('#FFFFFF');
  }
  c.textAlign='left';
}
function hexA(hex,a){var h=String(hex||'#000').replace('#','');if(h.length===3)h=h.replace(/./g,'$&$&');return 'rgba('+parseInt(h.substr(0,2),16)+','+parseInt(h.substr(2,2),16)+','+parseInt(h.substr(4,2),16)+','+a+')'}
function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
