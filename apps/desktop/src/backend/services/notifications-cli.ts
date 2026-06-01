import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("# Add these to .env.local on the machine running GoldSprints.");
console.log(`GOLDSPRINTS_WEB_PUSH_PUBLIC_KEY=${keys.publicKey}`);
console.log(`GOLDSPRINTS_WEB_PUSH_PRIVATE_KEY=${keys.privateKey}`);
console.log("GOLDSPRINTS_WEB_PUSH_SUBJECT=mailto:you@example.com");
