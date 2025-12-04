
const encoded3 = "eyJhdHQiOnsibGl0LWFjY2Vzc2NvbnRyb2xjb25kaXRpb246Ly8qIjp7IlRocmVzaG9sZC9FeGVjdXRpb24iOlt7fV19fSwicHJmIjpbXX0";
console.log("Test 3 Decoded:", Buffer.from(encoded3, 'base64').toString());
