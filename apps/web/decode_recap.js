
const encoded1 = "eyJhdHQiOnsibGl0LWFjY2Vzc2NvbnRyb2xjb25kaXRpb246Ly8qIjp7IlRocmVzaG9sZC9EZWNyeXB0aW9uIjpbe31dfX0sInByZiI6W119";
const encoded2 = "eyJhdHQiOnsibGl0LWxpdGFjdGlvbjovLyoiOnsiVGhyZXNob2xkL0V4ZWN1dGlvbiI6W3t9XX19LCJwcmYiOltdfQ";

console.log("Test 1 Decoded:", Buffer.from(encoded1, 'base64').toString());
console.log("Test 2 Decoded:", Buffer.from(encoded2, 'base64').toString());
