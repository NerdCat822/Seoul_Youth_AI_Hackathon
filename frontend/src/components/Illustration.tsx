import type { Category } from '../types';

export function Illustration({ kind = 'MENU' }: { kind?: Category }) {
  return (
    <div className={`illustration illustration-${kind.toLowerCase()}`} aria-hidden="true">
      <svg viewBox="0 0 220 160" fill="none">
        {kind === 'MENU' ? (
          <>
            <ellipse cx="111" cy="143" rx="65" ry="9" fill="#eac9b7" />
            <g transform="rotate(-9 105 85)">
              <rect x="62" y="23" width="93" height="119" rx="12" fill="#bf7255" />
              <rect x="68" y="29" width="81" height="107" rx="7" fill="#fffaee" />
              <ellipse cx="108" cy="73" rx="27" ry="22" fill="#f5dfbf" />
              <path d="M85 74h46q-4 19-23 19T85 74" fill="#e59369" />
              <path
                d="m95 67 9 10m3-13 10 12m2-10 8 8"
                stroke="#ba6741"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M82 108h51m-51 10h35"
                stroke="#d9b79e"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </g>
            <circle cx="157" cy="46" r="22" fill="#c35e41" />
            <path d="m157 31 4 10 11 1-8 7 2 11-9-6-9 6 2-11-8-7 11-1z" fill="#fff0c7" />
          </>
        ) : kind === 'OPERATION' ? (
          <>
            <ellipse cx="111" cy="141" rx="69" ry="9" fill="#b6d5c9" />
            <path d="M56 69h107v69H56z" fill="#f9fcf7" />
            <path
              d="m49 69 16-25h90l17 25v15q-10 10-20 0-10 10-20 0-10 10-20 0-10 10-20 0-10 10-20 0-10 10-20 0z"
              fill="#4d917d"
            />
            <path
              d="m78 44-7 25v15m31-40-1 25v15m27-40 4 25v15m15-40 11 25v15"
              stroke="#d8eee2"
              strokeWidth="13"
            />
            <rect x="68" y="99" width="42" height="23" rx="3" fill="#b7d9cb" />
            <rect x="124" y="97" width="25" height="41" rx="3" fill="#659c89" />
            <circle cx="143" cy="119" r="2" fill="#fff" />
            <path d="M177 115q-10-18-5-28 16 14 9 30m2-4q2-15 17-15-2 15-17 19" fill="#5b9b7d" />
            <path d="M173 117h18l-4 20h-10z" fill="#d9ab78" />
          </>
        ) : (
          <>
            <ellipse cx="111" cy="143" rx="64" ry="9" fill="#d1c6e8" />
            <path d="m73 61-9 78h84l-8-78Z" fill="#a68acf" />
            <path
              d="M91 69V51q0-20 17-20t17 20v18"
              stroke="#72569b"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path d="m119 82 57 9-5 35-58-9 1-11q13-3 4-14z" fill="#fff1cf" />
            <circle cx="137" cy="98" r="3" fill="#916bb4" />
            <circle cx="151" cy="113" r="3" fill="#916bb4" />
            <path
              d="m135 111 17-12M48 49v14m-7-7h14m117-22v11m-5-5h11"
              stroke="#916bb4"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </div>
  );
}
