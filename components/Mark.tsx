// Illustrative planning map: locations and routes are fictional, not operational guidance.
export function Mark() {
  return (
    <svg viewBox="0 0 760 480" role="img" aria-label="Illustrative fireground planning map on graph paper: streets, a long driveway, hose route, fill site, and curbside staging locations A and B on streets away from the incident, leaving the scene approach open." className="fireground-plan mb-8 w-full" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter">
      <defs>
        <pattern id="fireground-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" strokeWidth="0.5" opacity="0.12" />
        </pattern>
        <pattern id="fireground-staging-hatch" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M-2 2L2-2M0 8L8 0M6 10L10 6" className="text-[var(--plan-accent)]" strokeWidth="0.6" opacity="0.25" />
        </pattern>
      </defs>
      <rect x="1" y="1" width="758" height="478" rx="0" fill="url(#fireground-grid)" strokeOpacity="0.15" />
      {/* Streets are broad, quiet double lines. */}
      <g strokeWidth="1.5" opacity="0.3">
        <path d="M0 264H186V0M0 300H186V480M222 0V264H760M222 480V300H760" />
        <path d="M0 282H760M204 0V480" strokeDasharray="5 9" strokeWidth="1" />
        <path d="M438 0V73Q438 90 455 90H760M466 0V56Q466 62 474 62H760" />
      </g>
      {/* Small building footprints give the map a neighbourhood scale. */}
      <g strokeWidth="1" opacity="0.24">
        <path d="M35 51H83V89H35ZM112 42H155V78H112ZM41 129H94V169H41ZM119 115H160V158H119ZM42 327H103V360H42ZM259 32H304V67H259ZM335 27H387V69H335ZM260 118H308V157H260ZM481 327H534V361H481ZM568 324H613V363H568ZM647 326H711V362H647Z" />
        <path d="M55 89V107H186M94 145H186M282 67V85H222M361 69V102H222M103 344H186M506 327V300M590 324V300M677 326V300" />
      </g>
      <g strokeWidth="1" opacity="0.24">
        <path d="M42 408H103V447H42ZM273 414H322V449H273ZM370 407H420V445H370ZM493 413H545V450H493Z" />
        <path d="M103 427H186M273 432H222" />
      </g>
      {/* Long driveway: gentle bends, with a clear centre and hose along one edge. */}
      <g opacity="0.5" strokeWidth="1.5">
        <path d="M362 264V234Q362 207 391 199L501 166Q528 158 528 132V117" />
        <path d="M386 264V239Q386 229 403 223L513 190Q552 179 552 139V117" />
      </g>
      {/* Incident building. */}
      <g strokeWidth="2">
        <path d="M514 103V82H560V103H573V132H514Z" />
        <path d="M522 91H551M523 113H563" opacity="0.3" />
      </g>
      <g className="text-[var(--plan-ink)]" strokeWidth="2">
        <circle cx="544" cy="105" r="48" strokeDasharray="3 6" opacity="0.4" />
      </g>
      {/* One continuous supply route follows the street and driveway edge. */}
      <g className="text-[var(--plan-accent)]" strokeWidth="2.5">
        <path d="M83 236H341Q355 236 355 222Q355 202 385 192L496 159Q519 153 519 136" />
        <circle cx="83" cy="236" r="6" fill="currentColor" stroke="none" />
        <path d="M163 232L169 236L163 240M444 170L451 173L447 179" strokeWidth="2" />
      </g>
      {/* Apparatus near the incident, drawn as tiny plan-view blocks. */}
      <g strokeWidth="1.5">
        <rect x="510" y="134" width="18" height="30" rx="0" />
        <path d="M511 141H527M514 148V159M520 148V159" />
      </g>
      {/* Curbside staging on remote street segments; junction and scene approach stay open. */}
      <g className="text-[var(--plan-accent)]" strokeWidth="1.5">
        <rect x="28" y="284" width="130" height="14" fill="url(#fireground-staging-hatch)" />
        <rect x="40" y="287" width="26" height="8" fill="var(--plan-paper)" />
        <rect x="82" y="287" width="26" height="8" fill="var(--plan-paper)" />
        <rect x="124" y="287" width="26" height="8" fill="var(--plan-paper)" />
        <path d="M60 288V294M102 288V294M144 288V294" />
        <rect x="206" y="344" width="14" height="88" fill="url(#fireground-staging-hatch)" />
        <rect x="209" y="356" width="8" height="26" fill="var(--plan-paper)" />
        <rect x="209" y="398" width="8" height="26" fill="var(--plan-paper)" />
        <path d="M210 362H216M210 404H216" />
        {/* Annotation leaders identify the street footprints without covering the travel lane. */}
        <path d="M93 298V310H52M220 384H244" strokeWidth="1" />
        <rect x="28" y="302" width="20" height="20" fill="var(--plan-paper)" />
        <rect x="246" y="374" width="20" height="20" fill="var(--plan-paper)" />
        <g fill="currentColor" stroke="none" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="13" fontWeight="700">
          <text x="38" y="317">A</text>
          <text x="256" y="389">B</text>
        </g>
      </g>
      {/* Map labels are deliberately sparse. */}
      <g fill="currentColor" stroke="none" fontFamily="ui-monospace, SFMono-Regular, monospace" fontSize="10" letterSpacing="1">
        <text x="26" y="25" opacity="0.5">FIREGROUND / SUPPLY PLAN</text>
        <text x="42" y="217" fontSize="12" fontWeight="700" className="text-[var(--plan-accent)]">FILL SITE</text>
        <text x="56" y="320" className="text-[var(--plan-accent)]" fontSize="11" fontWeight="700">STAGING A</text>
        <text x="274" y="389" className="text-[var(--plan-accent)]" fontSize="11" fontWeight="700">STAGING B</text>
        <text x="593" y="105" className="text-[var(--plan-ink)]">INCIDENT</text>
        <text x="399" y="245" opacity="0.6">LONG DRIVEWAY</text>
        <text x="274" y="405" opacity="0.6">APPROACH FROM SOUTH</text>
        <text x="449" y="286" opacity="0.6">SCENE APPROACH / KEEP OPEN</text>
      </g>
      <g className="text-[var(--plan-accent)]" stroke="none" fill="currentColor" fontFamily="ui-monospace, monospace" fontSize="11" fontWeight="700">
        <path d="M26 44H36" stroke="currentColor" strokeWidth="2" />
        <text x="44" y="48">PLAN OVERLAY / STAGING + SUPPLY</text>
      </g>
      <g transform="translate(714 28)" strokeWidth="1" opacity="0.5">
        <path d="M0 22V0M-4 7L0 0L4 7" />
        <text x="-3" y="35" fill="currentColor" stroke="none" fontFamily="monospace" fontSize="9">N</text>
      </g>
    </svg>
  );
}
