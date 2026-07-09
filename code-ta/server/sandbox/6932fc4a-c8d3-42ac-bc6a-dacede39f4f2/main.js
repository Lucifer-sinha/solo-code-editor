console.log("Hello from JavaScript!");
console.log("Testing backend execution system...");

for (let i = 0; i < 5; i++) {
    console.log(`Count: ${i}`);
    // Simulate some work
    const start = Date.now();
    while (Date.now() - start < 500) {}
}

console.log("JavaScript execution completed!"); 