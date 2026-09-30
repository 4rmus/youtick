/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                near: {
                    black: '#000000',
                    white: '#FFFFFF',
                    'off-white': '#f2f1e9',
                    green: '#00ec97',
                    red: '#ff7966',
                    purple: '#9797ff',
                    blue: '#17d9d4',
                }
            }
        },
    },
    plugins: [],
}
