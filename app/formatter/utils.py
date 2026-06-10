# Roman numeral conversion
_ROMAN_NUMERALS = [
    (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
    (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
    (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")
]


def to_roman(num: int) -> str:
    """Number -> Roman numeral."""
    if num <= 0: return str(num)
    result = ""
    for value, numeral in _ROMAN_NUMERALS:
        while num >= value:
            result += numeral
            num -= value
    return result


def to_alpha(num: int) -> str:
    """Number -> uppercase letter. 1=A, 2=B, ..., 26=Z, 27=AA."""
    if num <= 0: return str(num)
    result = ""
    while num > 0:
        num -= 1
        result = chr(65 + num % 26) + result
        num //= 26
    return result
