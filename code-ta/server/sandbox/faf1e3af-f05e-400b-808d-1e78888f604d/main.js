import matplotlib.pyplot as plt
import matplotlib.animation as animation

# Create a figure and axis
fig, ax = plt.subplots()
ax.set_xlim(0, 10)
ax.set_ylim(0, 1)

# Circle object
circle, = ax.plot([], [], 'ro', markersize=10)

# Initialization function
def init():
    circle.set_data([], [])
    return circle,

# Animation function
def animate(frame):
    x = frame * 0.1   # X moves gradually
    y = 0.5           # Y stays fixed
    circle.set_data(x, y)
    return circle,

# Create the animation
ani = animation.FuncAnimation(
    fig, animate, init_func=init,
    frames=100, interval=50, blit=True
)

plt.show()
