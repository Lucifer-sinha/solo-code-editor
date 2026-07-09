print("Starting main.py")
import os
print('Current working directory:', os.getcwd())
print('Files in directory:', os.listdir('.'))

try:
    import hello
    print("Successfully imported hello")
    result = hello.say_hello()
    print("Result from hello:", result)
except Exception as e:
    print("Error importing hello:", e)

try:
    import my_module as m
    print("Successfully imported my_module")
    result2 = m.shout("ansh")
    
    print("Result from my_module:", result2)
except Exception as e:
    print("Error importing my_module:", e)

print("main.py finished") 