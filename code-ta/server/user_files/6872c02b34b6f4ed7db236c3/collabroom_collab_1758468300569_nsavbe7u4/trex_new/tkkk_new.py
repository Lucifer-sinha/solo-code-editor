
import sys

def just_checking():
    """
    This function demonstrates basic error handling and returns a simple string.
    """
    try:
        # Attempt a potentially risky operation (e.g., division by zero)
        result = 1 / 1  # No division by zero here
        return "All good!"  # Return a success message

    except ZeroDivisionError:
        print("Error: Division by zero occurred!", file=sys.stderr)
        return "Error: Division by zero"  # Indicate an error

    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        return f"Error: {type(e).__name__}" # Return generic error with type

if __name__ == "__main__":
    # Example usage of the function
    message = just_checking()
    print(message) # Print the returned message
