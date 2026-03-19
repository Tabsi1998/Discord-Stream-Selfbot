module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: '#202225',
        surface: '#2f3136',
        'surface-hover': '#36393f',
        'surface-light': '#40444b',
        primary: '#5865F2',
        'primary-hover': '#4752c4',
        success: '#3BA55C',
        warning: '#FAA61A',
        danger: '#ED4245',
        'txt': '#dcddde',
        'txt-muted': '#72767d',
        'txt-bright': '#ffffff',
        'border-dark': '#202225',
      },
      fontFamily: {
        heading: ['Work Sans', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
