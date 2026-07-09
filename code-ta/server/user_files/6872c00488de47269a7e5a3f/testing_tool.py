
# No imports required as per the requirements.

def create_empty_file(filename="empty_file.txt"):
    """
    Creates an empty plaintext file.

    Args:
        filename (str, optional): The name of the file to create.
            Defaults to "empty_file.txt".
    """
    try:
        with open(filename, "w") as f:
            # "w" mode creates a new file or overwrites an existing one.
            # The 'with' statement ensures the file is closed properly.
            pass # Creating a zero-length file (nothing written)
        print(f"Successfully created an empty file named '{filename}'.")
    except Exception as e:
        print(f"An error occurred while creating the file: {e}")

if __name__ == "__main__":
    create_empty_file() # Create an empty file with the default name
