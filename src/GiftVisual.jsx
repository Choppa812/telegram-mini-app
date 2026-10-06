import React, { useState } from 'react';
import visuals from './visuals.json';
export function BackdropSwatch({name}) {
  return <span className="backdrop-swatch" title={name} style={{background:visuals.backdrops[name]}} />;
}
export function SymbolVisual({name}) {
  return <img className="symbol-visual" src={visuals.symbols[name]} alt={name} loading="lazy" />;
}
export default function GiftVisual({collection,model,backdrop,symbol,image,className='gift'}) {
  const src=image || visuals.models[collection]?.[model] || visuals.collections[collection];
  const [failed,F]=useState(null);
  return <span className={className+' gift-visual'} style={{background:visuals.backdrops[backdrop]}}>
    {symbol && visuals.symbols[symbol] && <span className="gift-pattern" aria-hidden="true" style={{backgroundImage:`url(${visuals.symbols[symbol]})`}} />}
    {src && failed!==src ? <img src={src} alt={model ? `${collection} — ${model}`:collection} loading="lazy" onError={()=>F(src)} /> : <span className="visual-unavailable">{collection==='*'?'Все': 'Нет изображения'}</span>}
  </span>;
}
