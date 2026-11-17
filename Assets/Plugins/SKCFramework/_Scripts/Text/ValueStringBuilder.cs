/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//                                                                                        //
//      Based on .NET Core internal ValueStringBuilder design for zero-allocation strings  //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Buffers;

namespace SKC.Text
{
    /// <summary>
    /// Lightweight, stack-allocated string builder (ref struct).
    /// Operates directly on a stack-allocated buffer (stackalloc char[256]) with 0 heap allocation.
    /// If capacity is exceeded, safely falls back to ArrayPool and returns it on Dispose.
    /// </summary>
    /// <example>
    /// <code>
    /// Span&lt;char&gt; buffer = stackalloc char[128];
    /// using var vsb = new ValueStringBuilder(buffer);
    /// vsb.Append("Level: ");
    /// vsb.Append(12);
    /// string result = vsb.ToString();
    /// </code>
    /// </example>
    public ref struct ValueStringBuilder
    {
        private char[] _arrayToReturnToPool;
        private Span<char> _chars;
        private int _pos;

        public ValueStringBuilder(Span<char> initialBuffer)
        {
            _arrayToReturnToPool = null;
            _chars = initialBuffer;
            _pos = 0;
        }

        public int Length
        {
            get => _pos;
            set
            {
                if (value < 0 || value > _chars.Length)
                {
                    throw new ArgumentOutOfRangeException(nameof(value));
                }
                _pos = value;
            }
        }

        public int Capacity => _chars.Length;

        public ref char this[int index] => ref _chars[index];

        public void Append(char c)
        {
            int pos = _pos;
            if ((uint)pos < (uint)_chars.Length)
            {
                _chars[pos] = c;
                _pos = pos + 1;
            }
            else
            {
                GrowAndAppend(c);
            }
        }

        public void Append(string s)
        {
            if (string.IsNullOrEmpty(s)) return;

            int pos = _pos;
            if (s.Length == 1 && (uint)pos < (uint)_chars.Length)
            {
                _chars[pos] = s[0];
                _pos = pos + 1;
            }
            else
            {
                AppendSlow(s);
            }
        }

        private void AppendSlow(string s)
        {
            int pos = _pos;
            if (pos > _chars.Length - s.Length)
            {
                Grow(s.Length);
            }

            s.AsSpan().CopyTo(_chars.Slice(pos));
            _pos += s.Length;
        }

        public void Append(ReadOnlySpan<char> value)
        {
            int pos = _pos;
            if (pos > _chars.Length - value.Length)
            {
                Grow(value.Length);
            }

            value.CopyTo(_chars.Slice(pos));
            _pos += value.Length;
        }

        public void Append(int value)
        {
            if (_pos >= _chars.Length - 16)
            {
                Grow(16);
            }

            if (value.TryFormat(_chars.Slice(_pos), out int charsWritten))
            {
                _pos += charsWritten;
            }
            else
            {
                Append(value.ToString());
            }
        }

        public void Append(long value)
        {
            if (_pos >= _chars.Length - 32)
            {
                Grow(32);
            }

            if (value.TryFormat(_chars.Slice(_pos), out int charsWritten))
            {
                _pos += charsWritten;
            }
            else
            {
                Append(value.ToString());
            }
        }

        public void Append(float value)
        {
            if (_pos >= _chars.Length - 32)
            {
                Grow(32);
            }

            if (value.TryFormat(_chars.Slice(_pos), out int charsWritten))
            {
                _pos += charsWritten;
            }
            else
            {
                Append(value.ToString());
            }
        }

        public void Append(double value)
        {
            if (_pos >= _chars.Length - 32)
            {
                Grow(32);
            }

            if (value.TryFormat(_chars.Slice(_pos), out int charsWritten))
            {
                _pos += charsWritten;
            }
            else
            {
                Append(value.ToString());
            }
        }

        public ReadOnlySpan<char> AsSpan() => _chars.Slice(0, _pos);

        public void Clear()
        {
            _pos = 0;
        }

        public override string ToString()
        {
            return _chars.Slice(0, _pos).ToString();
        }

        private void GrowAndAppend(char c)
        {
            Grow(1);
            Append(c);
        }

        private void Grow(int requiredAdditionalCapacity)
        {
            int newCapacity = Math.Max(_chars.Length * 2, _chars.Length + requiredAdditionalCapacity);
            char[] poolArray = ArrayPool<char>.Shared.Rent(newCapacity);

            _chars.Slice(0, _pos).CopyTo(poolArray);

            char[] toReturn = _arrayToReturnToPool;
            _chars = _arrayToReturnToPool = poolArray;

            if (toReturn != null)
            {
                ArrayPool<char>.Shared.Return(toReturn);
            }
        }

        public void Dispose()
        {
            char[] toReturn = _arrayToReturnToPool;
            this = default;
            if (toReturn != null)
            {
                ArrayPool<char>.Shared.Return(toReturn);
            }
        }
    }
}
