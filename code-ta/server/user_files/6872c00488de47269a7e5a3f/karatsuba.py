def karatsuba(x, y):
    """
    Optimized Karatsuba algorithm for fast multiplication of large integers.
    Time Complexity: O(n^log2(3)) ≈ O(n^1.585)
    
    Args:
        x: First integer
        y: Second integer
    
    Returns:
        Product of x and y
    """
    # Base case for recursion
    if x < 10 or y < 10:
        return x * y
    
    # Calculate the size of the numbers
    n = max(len(str(x)), len(str(y)))
    half = n // 2
    
    # Split the numbers into high and low parts
    # x = x1 * 10^half + x0
    # y = y1 * 10^half + y0
    power = 10 ** half
    x1, x0 = divmod(x, power)
    y1, y0 = divmod(y, power)
    
    # Three recursive calls (Karatsuba optimization)
    z0 = karatsuba(x0, y0)  # Low parts
    z2 = karatsuba(x1, y1)  # High parts
    z1 = karatsuba(x1 + x0, y1 + y0) - z2 - z0  # Middle term
    
    # Combine results: z2 * 10^(2*half) + z1 * 10^half + z0
    return z2 * (10 ** (2 * half)) + z1 * power + z0


def karatsuba_optimized(x, y, threshold=50):
    """
    Enhanced Karatsuba with threshold optimization.
    Uses standard multiplication for small numbers to reduce overhead.
    
    Args:
        x: First integer
        y: Second integer
        threshold: Switch to standard multiplication below this digit count
    
    Returns:
        Product of x and y
    """
    # Use standard multiplication for small numbers
    if x < 10 ** threshold or y < 10 ** threshold:
        return x * y
    
    # Calculate the size of the numbers
    n = max(len(str(x)), len(str(y)))
    half = n // 2
    
    # Split the numbers
    power = 10 ** half
    x1, x0 = divmod(x, power)
    y1, y0 = divmod(y, power)
    
    # Three recursive calls
    z0 = karatsuba_optimized(x0, y0, threshold)
    z2 = karatsuba_optimized(x1, y1, threshold)
    z1 = karatsuba_optimized(x1 + x0, y1 + y0, threshold) - z2 - z0
    
    # Combine results
    return z2 * (10 ** (2 * half)) + z1 * power + z0


def main():
    """Test the Karatsuba algorithm with examples."""
    print("=" * 60)
    print("Optimized Karatsuba Multiplication Algorithm")
    print("=" * 60)
    
    # Test cases
    test_cases = [
        (1234, 5678),
        (12345678, 87654321),
        (123456789012345, 987654321098765),
    ]
    
    print("\nTest Results:")
    print("-" * 60)
    
    for x, y in test_cases:
        result_basic = karatsuba(x, y)
        result_optimized = karatsuba_optimized(x, y)
        result_standard = x * y
        
        print(f"\nX: {x}")
        print(f"Y: {y}")
        print(f"Karatsuba Result: {result_basic}")
        print(f"Optimized Result: {result_optimized}")
        print(f"Standard Result:  {result_standard}")
        print(f"Verification: {'✓ PASS' if result_basic == result_standard else '✗ FAIL'}")
    
    # Interactive mode
    print("\n" + "=" * 60)
    print("Interactive Mode")
    print("=" * 60)
    
    try:
        num1 = int(input("\nEnter first number: "))
        num2 = int(input("Enter second number: "))
        
        result = karatsuba_optimized(num1, num2)
        print(f"\nResult using Karatsuba: {result}")
        print(f"Verification (standard): {num1 * num2}")
        print(f"Match: {'✓ YES' if result == num1 * num2 else '✗ NO'}")
        
    except ValueError:
        print("\nInvalid input. Please enter integers only.")
    except KeyboardInterrupt:
        print("\n\nExecution interrupted by user.")
    
    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()