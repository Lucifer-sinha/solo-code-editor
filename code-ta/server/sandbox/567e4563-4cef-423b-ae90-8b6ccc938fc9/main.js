import time

print("Hello from Python!")
print("Testing backend execution system...")
print("enter the n: ", end='', flush=True)
n = int(input())
for i in range(n):
    print(f"Count: {i}")
    time.sleep(0.5)
print("Python execution completed!")