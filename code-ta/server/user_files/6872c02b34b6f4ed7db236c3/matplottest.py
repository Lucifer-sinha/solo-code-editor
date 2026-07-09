import matplotlib.pyplot as plt

# Data
x = [1, 2, 3, 4, 5]
y = [i**2 for i in x]

# Plot
plt.plot(x, y, marker='o', color='purple', label="y = x^2")
plt.title("Quadratic Graph")
plt.xlabel("X-axis")
plt.ylabel("Y-axis")
plt.legend()
plt.grid(True)

# Save image (PNG format)
plt.savefig("graph.png")   # current folder me save ho jayega
plt.show()
