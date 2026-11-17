/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/

using System;
using System.Collections.Generic;
using System.Text;

namespace SKC.Text
{
    /// <summary>
    /// High-performance, zero-allocation pool for System.Text.StringBuilder.
    /// Provides IDisposable struct scope pattern to eliminate heap allocations during string manipulation.
    /// </summary>
    public static class StringBuilderPool
    {
        private const int DefaultCapacity = 256;
        private const int MaxRetentionCapacity = 2048;
        private const int MaxPoolSize = 64;

        private static readonly Stack<StringBuilder> Pool = new Stack<StringBuilder>(MaxPoolSize);
        private static readonly object SyncLock = new object();

        /// <summary>
        /// Acquires a pooled StringBuilder wrapped inside an IDisposable struct scope.
        /// When the scope exits (using block ends), the builder is cleared and returned to the pool automatically with 0 GC.
        /// </summary>
        /// <example>
        /// <code>
        /// using (StringBuilderPool.Get(out var sb))
        /// {
        ///     sb.Append("Level ").Append(10);
        ///     tmpText.SetText(sb); // 0 GC!
        /// }
        /// </code>
        /// </example>
        public static StringBuilderScope Get(out StringBuilder builder)
        {
            builder = Acquire(DefaultCapacity);
            return new StringBuilderScope(builder);
        }

        /// <summary>
        /// Acquires a pooled StringBuilder with a specified initial capacity.
        /// </summary>
        public static StringBuilderScope Get(int initialCapacity, out StringBuilder builder)
        {
            builder = Acquire(initialCapacity);
            return new StringBuilderScope(builder);
        }

        /// <summary>
        /// Manually acquires a StringBuilder from the pool. Must be released via Release().
        /// Prefer using <see cref="Get(out StringBuilder)"/> with a using block whenever possible.
        /// </summary>
        public static StringBuilder Acquire(int initialCapacity = DefaultCapacity)
        {
            lock (SyncLock)
            {
                if (Pool.Count > 0)
                {
                    var sb = Pool.Pop();
                    sb.Clear();
                    if (sb.Capacity < initialCapacity)
                    {
                        sb.Capacity = initialCapacity;
                    }
                    return sb;
                }
            }

            return new StringBuilder(initialCapacity);
        }

        /// <summary>
        /// Returns a borrowed StringBuilder to the pool.
        /// </summary>
        public static void Release(StringBuilder builder)
        {
            if (builder == null) return;

            // Prevent memory bloating if a builder was resized to enormous sizes
            if (builder.Capacity > MaxRetentionCapacity)
            {
                return;
            }

            builder.Clear();

            lock (SyncLock)
            {
                if (Pool.Count < MaxPoolSize)
                {
                    Pool.Push(builder);
                }
            }
        }

        /// <summary>
        /// Executes an action with a pooled StringBuilder and returns the resulting string.
        /// Builder allocation is 0 GC; only the final returned string is allocated.
        /// </summary>
        public static string BuildString(Action<StringBuilder> buildAction, int initialCapacity = DefaultCapacity)
        {
            if (buildAction == null) return string.Empty;

            using (Get(initialCapacity, out var sb))
            {
                buildAction(sb);
                return sb.ToString();
            }
        }

        /// <summary>
        /// Non-allocating struct scope that returns the rented StringBuilder when disposed.
        /// </summary>
        public readonly struct StringBuilderScope : IDisposable
        {
            private readonly StringBuilder _builder;

            public StringBuilderScope(StringBuilder builder)
            {
                _builder = builder;
            }

            public StringBuilder Builder => _builder;

            public void Dispose()
            {
                if (_builder != null)
                {
                    Release(_builder);
                }
            }
        }
    }
}
