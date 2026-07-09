print("Starting main.py")

try:
    import hello
    print("Successfully imported hello")
    result = hello.say_hello()
    print("Result from hello:", result)
except Exception as e:
    print("Error importing hello:", e)

try:
    import test_import
    print("Successfully imported test_import")
    result2 = test_import.test_function()
    print("Result from test_import:", result2)
except Exception as e:
    print("Error importing test_import:", e)

print("main.py finished") 