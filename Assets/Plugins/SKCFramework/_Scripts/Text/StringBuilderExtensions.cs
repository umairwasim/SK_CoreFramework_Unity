/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Text;

namespace SKC.Text
{
    /// <summary>
    /// High-performance extension methods for StringBuilder providing zero-allocation formatting
    /// for numbers, time intervals, and digits without boxing or heap strings.
    /// </summary>
    public static class StringBuilderExtensions
    {
        private static readonly long[] Pow10 = 
        {
            1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000
        };

        /// <summary>
        /// Appends an integer padded to exactly 2 digits (e.g. 05, 12, 00) with ZERO garbage collection.
        /// Ideal for timer and clock displays (hh:mm:ss).
        /// </summary>
        public static StringBuilder AppendTwoDigits(this StringBuilder sb, int value)
        {
            if (value < 0)
            {
                sb.Append('-');
                value = -value;
            }

            if (value < 10)
            {
                sb.Append('0');
                sb.Append((char)('0' + value));
            }
            else if (value < 100)
            {
                sb.Append((char)('0' + (value / 10)));
                sb.Append((char)('0' + (value % 10)));
            }
            else
            {
                // Fallback for > 99
                sb.Append(value);
            }

            return sb;
        }

        /// <summary>
        /// Appends an integer padded to exactly 3 digits (e.g. 005, 042, 123) with ZERO garbage collection.
        /// Ideal for milliseconds.
        /// </summary>
        public static StringBuilder AppendThreeDigits(this StringBuilder sb, int value)
        {
            if (value < 0)
            {
                sb.Append('-');
                value = -value;
            }

            if (value < 10)
            {
                sb.Append("00");
                sb.Append((char)('0' + value));
            }
            else if (value < 100)
            {
                sb.Append('0');
                sb.Append((char)('0' + (value / 10)));
                sb.Append((char)('0' + (value % 10)));
            }
            else if (value < 1000)
            {
                sb.Append((char)('0' + (value / 100)));
                sb.Append((char)('0' + ((value / 10) % 10)));
                sb.Append((char)('0' + (value % 10)));
            }
            else
            {
                sb.Append(value);
            }

            return sb;
        }

        /// <summary>
        /// Appends a floating point number with specified decimal precision with ZERO garbage collection.
        /// </summary>
        public static StringBuilder AppendFloat(this StringBuilder sb, float value, int decimals = 2, bool trimTrailingZeros = false)
        {
            return AppendDouble(sb, (double)value, decimals, trimTrailingZeros);
        }

        /// <summary>
        /// Appends a double precision floating point number with specified decimal precision with ZERO garbage collection.
        /// </summary>
        public static StringBuilder AppendDouble(this StringBuilder sb, double value, int decimals = 2, bool trimTrailingZeros = false)
        {
            if (double.IsNaN(value)) return sb.Append("NaN");
            if (double.IsPositiveInfinity(value)) return sb.Append("Infinity");
            if (double.IsNegativeInfinity(value)) return sb.Append("-Infinity");

            if (value < 0)
            {
                sb.Append('-');
                value = -value;
            }

            // Integer part
            long integerPart = (long)value;
            sb.Append(integerPart);

            if (decimals <= 0) return sb;

            decimals = Math.Min(decimals, Pow10.Length - 1);
            long factor = Pow10[decimals];

            double fractional = value - integerPart;
            long fractionalPart = (long)Math.Round(fractional * factor);

            if (fractionalPart >= factor)
            {
                // Rounding up overflowed into integer part
                sb.Length -= integerPart.ToString().Length;
                sb.Append(integerPart + 1);
                fractionalPart = 0;
            }

            if (trimTrailingZeros && fractionalPart == 0)
            {
                return sb;
            }

            sb.Append('.');

            // Pad fractional part with leading zeros if needed
            long temp = fractionalPart;
            int digitsCount = 0;
            if (temp == 0) digitsCount = 1;
            else
            {
                while (temp > 0)
                {
                    digitsCount++;
                    temp /= 10;
                }
            }

            for (int i = 0; i < decimals - digitsCount; i++)
            {
                sb.Append('0');
            }

            if (fractionalPart > 0)
            {
                if (trimTrailingZeros)
                {
                    while (fractionalPart % 10 == 0)
                    {
                        fractionalPart /= 10;
                    }
                }
                sb.Append(fractionalPart);
            }

            return sb;
        }

        /// <summary>
        /// Appends a time interval from seconds formatted as mm:ss or hh:mm:ss with ZERO GC allocations.
        /// </summary>
        public static StringBuilder AppendTime(this StringBuilder sb, float totalSeconds, bool includeHours = false)
        {
            if (totalSeconds < 0) totalSeconds = 0;

            int totalSec = (int)totalSeconds;
            int hours = totalSec / 3600;
            int minutes = (totalSec % 3600) / 60;
            int seconds = totalSec % 60;

            if (includeHours || hours > 0)
            {
                sb.AppendTwoDigits(hours).Append(':');
            }

            sb.AppendTwoDigits(minutes).Append(':');
            sb.AppendTwoDigits(seconds);

            return sb;
        }

        /// <summary>
        /// Appends a TimeSpan formatted as hh:mm:ss with ZERO GC allocations.
        /// </summary>
        public static StringBuilder AppendTime(this StringBuilder sb, TimeSpan span, bool includeHours = true)
        {
            int hours = (int)span.TotalHours;
            int minutes = span.Minutes;
            int seconds = span.Seconds;

            if (includeHours || hours > 0)
            {
                sb.AppendTwoDigits(hours).Append(':');
            }

            sb.AppendTwoDigits(minutes).Append(':');
            sb.AppendTwoDigits(seconds);

            return sb;
        }
    }
}
