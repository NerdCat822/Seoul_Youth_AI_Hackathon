/** Trylog design tokens (Figma: Trylog_Design / 01_design) */
module.exports = {
  content: ['./*.html', './assets/js/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', '"Apple SD Gothic Neo"', '"Malgun Gothic"', 'system-ui', 'sans-serif'],
      },
      colors: {
        heading: '#030712',          // text/heading/strong
        body: '#1e2939',
        sub: '#6a7282',
        muted: 'rgba(3,7,18,0.40)',  // placeholder · disabled step
        dim: '#9ea3ad',
        link: '#4c5a82',
        line: 'rgba(3,7,18,0.12)',   // border
        'line-light': 'rgba(3,7,18,0.06)', // border-light
        divider: 'rgba(30,41,57,0.06)',
        surface: '#f3f4f6',
        'surface-2': '#f9fafb',
        brand: {
          DEFAULT: '#00aa72',        // border/primary-accent · primary button
          strong: '#019162',         // big numbers
          text: '#007a55',           // text/primary-main
          weak: '#e7f7f0',
          soft: '#d1fae5',
        },
        up: '#ec003f',               // 증가
        down: '#005eec',             // 감소
        danger: '#e7000b',
        error: '#fb2c36',
        info: '#155dfc',
        cat: {
          delivery: '#7008e7', 'delivery-bg': '#f3e8ff', 'delivery-img': '#f3f0ff',
          menu: '#ca3500', 'menu-bg': '#ffedd4', 'menu-img': '#fdf3e6',
          store: '#0069a8', 'store-bg': '#dff2fe', 'store-img': '#ebf6fd',
        },
      },
      maxWidth: { container: '1176px' },
      borderRadius: { card: '20px', panel: '24px' },
      boxShadow: {
        pop: '0 12px 32px rgba(3,7,18,0.12), 0 2px 6px rgba(3,7,18,0.06)',
        panel: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.06)',
      },
    },
  },
  plugins: [],
};
