/* NOVA SVG markup builder: fixed brand geometry, no user input. */
export const EYE = '#8FEAFA';
export const star = (cx, cy, s) => `M${cx} ${cy - s} Q${cx} ${cy} ${cx + s} ${cy} Q${cx} ${cy} ${cx} ${cy + s} Q${cx} ${cy} ${cx - s} ${cy} Q${cx} ${cy} ${cx} ${cy - s}Z`;

function parts(state) {
  const open = `<g class="nova-eyes"><rect class="nova-eye" x="41" y="53" width="10" height="14" rx="5" fill="${EYE}"/><rect class="nova-eye" x="69" y="53" width="10" height="14" rx="5" fill="${EYE}"/><circle cx="48" cy="56.5" r="1.8" fill="#fff"/><circle cx="76" cy="56.5" r="1.8" fill="#fff"/></g>`;
  const closed = `<path d="M41 63q5-8 10 0M69 63q5-8 10 0" stroke="${EYE}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  const smile = `<path d="M54 73q6 5 12 0" stroke="${EYE}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const oh = `<circle cx="60" cy="74" r="3" stroke="${EYE}" stroke-width="2.5" fill="none"/>`;
  const armR = (x, y) => `<path d="M95 76L${x} ${y}" stroke="#4326A8" stroke-width="5" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="4.5" fill="#28C6E5"/>`;
  const armL = (x, y) => `<path d="M25 76L${x} ${y}" stroke="#4326A8" stroke-width="5" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="4.5" fill="#28C6E5"/>`;
  switch (state) {
    case 'happy': return { eyes: closed, mouth: smile };
    case 'helping': return { eyes: open, mouth: smile, arms: armR(112, 64), props: `<path d="${star(113, 52, 6)}" fill="#FFC93C"/>` };
    case 'thinking': return { eyes: `<g class="nova-eyes"><rect class="nova-eye" x="44" y="50" width="10" height="12" rx="5" fill="${EYE}"/><rect class="nova-eye" x="72" y="50" width="10" height="12" rx="5" fill="${EYE}"/></g>`, mouth: `<path d="M56 74q5 2 9-2" stroke="${EYE}" stroke-width="3" fill="none" stroke-linecap="round"/>`, props: '<circle cx="98" cy="24" r="3" fill="#B7A6FF"/><circle cx="106" cy="14" r="4.5" fill="#B7A6FF"/>' };
    case 'empty': return { eyes: `<g class="nova-eyes"><rect class="nova-eye" x="38" y="55" width="10" height="13" rx="5" fill="${EYE}"/><rect class="nova-eye" x="66" y="55" width="10" height="13" rx="5" fill="${EYE}"/></g>`, mouth: oh, arms: armL(12, 86), props: '<rect x="0" y="88" width="22" height="18" rx="5" fill="none" stroke="#B7A6FF" stroke-width="2.5" stroke-dasharray="4 4"/>' };
    case 'sleeping': return { eyes: `<path d="M41 61h10M69 61h10" stroke="${EYE}" stroke-width="3.5" stroke-linecap="round"/>`, mouth: `<path d="M57 74h6" stroke="${EYE}" stroke-width="3" stroke-linecap="round"/>`, antenna: '#8A8594', props: '<text x="92" y="30" font-family="Sora,sans-serif" font-weight="700" font-size="14" fill="#B7A6FF">z</text><text x="102" y="18" font-family="Sora,sans-serif" font-weight="700" font-size="10" fill="#B7A6FF">z</text>' };
    case 'success': return { eyes: closed, mouth: smile, props: '<circle cx="99" cy="33" r="11" fill="#39D49A" stroke="#fff" stroke-width="3"/><path d="M94 33l3.5 3.5 6.5-7" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' };
    case 'warning': return { eyes: `<g class="nova-eyes"><rect class="nova-eye" x="41" y="56" width="10" height="11" rx="5" fill="${EYE}"/><rect class="nova-eye" x="69" y="56" width="10" height="11" rx="5" fill="${EYE}"/></g>`, mouth: `<path d="M55 74h10" stroke="${EYE}" stroke-width="3" stroke-linecap="round"/>`, props: '<path d="M99 21l12 21H87z" fill="#D98600" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M99 29v6M99 38.5v.01" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' };
    default: return { eyes: open, mouth: smile };
  }
}

export function novaMarkup(state = 'neutral') {
  const p = parts(state);
  return `<ellipse class="nova-shadow" cx="60" cy="114" rx="26" ry="3.5" fill="#5638D8" opacity=".14"/>
<path d="M24 62H15M96 62h9" stroke="#4326A8" stroke-width="4" stroke-linecap="round"/>
<circle class="nova-ear" cx="11" cy="62" r="6" fill="#28C6E5"/><circle class="nova-ear" cx="109" cy="62" r="6" fill="#28C6E5"/>
<path d="M60 30V17" stroke="#4326A8" stroke-width="4" stroke-linecap="round"/>
<path class="nova-antenna" d="${star(60, 12, 8)}" fill="${p.antenna || '#FFC93C'}"/>
${p.arms || ''}
<rect x="22" y="28" width="76" height="72" rx="32" fill="#5638D8"/>
<path d="M34 40q8-8 22-8" stroke="#fff" stroke-opacity=".22" stroke-width="4" stroke-linecap="round" fill="none"/>
<rect x="31" y="42" width="58" height="40" rx="18" fill="#151221"/>
<circle cx="38" cy="75" r="3" fill="#FF716B" opacity=".55"/><circle cx="82" cy="75" r="3" fill="#FF716B" opacity=".55"/>
${p.eyes}${p.mouth}${p.props || ''}`;
}
