def maxprofit(prices):
    min_price = float('inf')  # Set to very large number initially
    max_profit = 0

    for price in prices:
        if price < min_price:
            min_price = price  # Found a new minimum (best day to buy)
        else:
            profit = price - min_price  # Potential profit if sold today
            max_profit = max(max_profit, profit)
    print(max_profit)

print("done")
maxprofit(prices=[1,5,7,2,4,8])
print("passed")