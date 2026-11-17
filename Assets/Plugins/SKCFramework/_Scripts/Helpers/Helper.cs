/*//////////////////////////////////////////////////////////////////////////////////////////
//      █─▄▄▄▄█▄─█─▄█─▄▄▄─█                                                               //
//      █▄▄▄▄─██─▄▀██─███▀█             Scripts created by Semih Kubilay Çetin            //
//      ▀▄▄▄▄▄▀▄▄▀▄▄▀▄▄▄▄▄▀                                                               //
//////////////////////////////////////////////////////////////////////////////////////////*/
using System;
using System.Collections.Generic;
using System.Text;
using SKC.Scheduler;
using SKC.Text;
using SKC.Logging;
using UnityEngine;

namespace SKC.Helpers
{
    public static class Strings
    {
        /// <summary>
        /// Formats a number with standard metric postfix (K, M, B, T) directly into a StringBuilder with ZERO GC allocations.
        /// </summary>
        public static void ConvertNumberToStringWithPostfix(StringBuilder sb, double number)
        {
            if (sb == null) return;
            if (number < 1000)
            {
                sb.Append((long)number);
                return;
            }

            string postfix = "";
            double num = number;
            if (num >= 1000 && num < 1000000)
            {
                num /= 1000;
                postfix = "K";
            }
            else if (num >= 1000000 && num < 1000000000)
            {
                num /= 1000000;
                postfix = "M";
            }
            else if (num >= 1000000000 && num < 1000000000000)
            {
                num /= 1000000000;
                postfix = "B";
            }
            else
            {
                num /= 1000000000000;
                postfix = "T";
            }

            sb.AppendDouble(num, 2, false);
            sb.Append(postfix);
        }

        public static string ConvertNumberToStringWithPostfix(double number)
        {
            using (StringBuilderPool.Get(out var sb))
            {
                ConvertNumberToStringWithPostfix(sb, number);
                return sb.ToString();
            }
        }
        
        /// <summary>
        /// Formats time in seconds (mm:ss) directly into a StringBuilder with ZERO GC allocations.
        /// </summary>
        public static void FormatTime(StringBuilder sb, float seconds)
        {
            if (sb == null) return;
            sb.AppendTime(seconds, includeHours: false);
        }

        public static string FormatTime(float seconds)
        {
            using (StringBuilderPool.Get(out var sb))
            {
                FormatTime(sb, seconds);
                return sb.ToString();
            }
        }
    }
    
    public static class CostCalculation
    {
        private const double BaseCost = 100;
        private const double GlobalMultiplier = 1.15;
        
        public static double CalculateCost(int currentLevel)
        {
            if (currentLevel < 1)
            {
                currentLevel = 1;
            }
            
            double rawCost = BaseCost * Math.Pow(GlobalMultiplier, currentLevel);

            return Math.Ceiling(rawCost);
        }
    }

    public static class AsynchronousOperation
    {
        private static readonly Dictionary<float, WaitForSeconds> WaitDictionary = new Dictionary<float, WaitForSeconds>();

        public static WaitForSeconds GetWait(float time)
        {
            if (WaitDictionary.TryGetValue(time, out var wait)) return wait;

            WaitDictionary[time] = new WaitForSeconds(time);
            return WaitDictionary[time];
        }
    }
    
    public static class TimerExtensions
    {
        // Allows calling smhCoroutine.Destroy() to stop the timer.
        public static void Destroy(this SemihCoroutine smhCoroutine)
        {
            if (smhCoroutine != null)
            {
                smhCoroutine.Stop(); 
                // Extension methods cannot set the instance reference to null; the caller must do so manually if needed.
            }
        }
    }
    public static class AnimationCurvePresets
    {
        // --- Simple & Built-in ---

        /// <summary>
        /// A straight line from (0,0) to (1,1). (t)
        /// </summary>
        public static AnimationCurve Linear => AnimationCurve.Linear(0f, 0f, 1f, 1f);

        /// <summary>
        /// A standard smooth step curve (starts slow, accelerates, then decelerates).
        /// This is Unity's default EaseInOut, good for general purpose smooth transitions.
        /// </summary>
        public static AnimationCurve EaseInOutSmooth => AnimationCurve.EaseInOut(0f, 0f, 1f, 1f);

        // --- Quadratic (t^2) ---

        /// <summary>
        /// Starts slow and accelerates (approximates t^2).
        /// </summary>
        public static AnimationCurve EaseInQuad => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, 0f), // time, value, inTangent, outTangent
            new Keyframe(1f, 1f, 2f, 0f)  // End tangent controls acceleration
        );

        /// <summary>
        /// Starts fast and decelerates (approximates 1-(1-t)^2).
        /// </summary>
        public static AnimationCurve EaseOutQuad => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, 2f), // Start tangent controls deceleration
            new Keyframe(1f, 1f, 0f, 0f)
        );

        /// <summary>
        /// Approximation of quadratic ease-in and ease-out.
        /// For simple InOut, EaseInOutSmooth is often preferred.
        /// </summary>
        public static AnimationCurve EaseInOutQuad => EaseInOutSmooth; // Or a custom 3-key version if specific shape needed

        // --- Cubic (t^3) ---

        /// <summary>
        /// Starts slower and accelerates more sharply than Quad (approximates t^3).
        /// </summary>
        public static AnimationCurve EaseInCubic => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, 0f),
            new Keyframe(1f, 1f, 3f, 0f) // Steeper end tangent
        );

        /// <summary>
        /// Starts faster and decelerates more sharply than Quad (approximates 1-(1-t)^3).
        /// </summary>
        public static AnimationCurve EaseOutCubic => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, 3f), // Steeper start tangent
            new Keyframe(1f, 1f, 0f, 0f)
        );

        /// <summary>
        /// Approximation of cubic ease-in and ease-out.
        /// </summary>
        public static AnimationCurve EaseInOutCubic => EaseInOutSmooth; // Or custom 3-key

        // --- Sine (sin(t)) --- (Approximations)

        /// <summary>
        /// Smooth acceleration, approximating a sine wave start. (1 - cos((t * PI) / 2))
        /// </summary>
        public static AnimationCurve EaseInSine => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, 0f),
            new Keyframe(1f, 1f, Mathf.PI / 2f, 0f) // Tangent related to sine curve slope
        );

        /// <summary>
        /// Smooth deceleration, approximating a sine wave end. (sin((t * PI) / 2))
        /// </summary>
        public static AnimationCurve EaseOutSine => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, Mathf.PI / 2f),
            new Keyframe(1f, 1f, 0f, 0f)
        );

        /// <summary>
        /// Smooth S-curve, like EaseInOutSmooth, approximating sine behavior. (-(cos(PI * t) - 1) / 2)
        /// </summary>
        public static AnimationCurve EaseInOutSine => EaseInOutSmooth; // Standard S-curve is a good visual match

        // --- Exponential (2^t) --- (Approximations)

        /// <summary>
        /// Exponential ease-in. Very slow start, very fast end. Approximation.
        /// </summary>
        public static AnimationCurve EaseInExpo => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, 0f),
            new Keyframe(0.7f, 0.05f, 0.1f, 0.1f), // Helper key for sharper curve
            new Keyframe(1f, 1f, 15f, 0f)      // Very steep end tangent
        );

        /// <summary>
        /// Exponential ease-out. Very fast start, very slow end. Approximation.
        /// </summary>
        public static AnimationCurve EaseOutExpo => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, 15f),     // Very steep start tangent
            new Keyframe(0.3f, 0.95f, 0.1f, 0.1f), // Helper key
            new Keyframe(1f, 1f, 0f, 0f)
        );

        /// <summary>
        /// Exponential ease-in and ease-out. Approximation.
        /// </summary>
        public static AnimationCurve EaseInOutExpo => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, 0f),
            new Keyframe(0.5f, 0.5f, 5f, 5f), // Steep tangents through midpoint
            new Keyframe(1f, 1f, 0f, 0f)
        );
        
        // --- Circular (sqrt(1-t^2)) --- (Approximations - harder to do well)
        // These are parts of a circle. True circular easing is best done with math.
        // The approximations below attempt to capture the visual feel.

        /// <summary>
        /// Circular ease-in. Starts slow, accelerates. Approximation.
        /// </summary>
        public static AnimationCurve EaseInCirc => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, 0f),
            new Keyframe(1f, 1f, 4f, 0f) // Steeper end tangent
        );

        /// <summary>
        /// Circular ease-out. Starts fast, decelerates. Approximation.
        /// </summary>
        public static AnimationCurve EaseOutCirc => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, 4f), // Steeper start tangent
            new Keyframe(1f, 1f, 0f, 0f)
        );
        
        /// <summary>
        /// Circular ease-in-out. Approximation.
        /// </summary>
        public static AnimationCurve EaseInOutCirc => EaseInOutSmooth; // Or custom 3-key

        // --- Back (Overshoot) --- (These are visually achievable)
        // The constant c1 = 1.70158f is common in "Back" easing formulas for the overshoot.
        // We'll use a multiplier on tangents to simulate this. Overshoot amount is approx 10%.

        private const float BackOvershootAmount = 0.1f; // For a 10% overshoot
        private const float BackTangentStrength = 2.5f; // Controls steepness towards overshoot/return


        /// <summary>
        /// Overshoots at the end, then settles. (e.g., Pulls back before shooting forward)
        /// </summary>
        public static AnimationCurve EaseInBack => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, 0f), // Start normal
            new Keyframe(0.8f, -BackOvershootAmount, -BackTangentStrength * 0.5f, BackTangentStrength * 0.5f), // Overshoot backward
            new Keyframe(1f, 1f, BackTangentStrength, 0f) // Settle at end
        );


        /// <summary>
        /// Starts by moving past the target, then settles back.
        /// </summary>
        public static AnimationCurve EaseOutBack => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, BackTangentStrength), // Start normal, but with outward velocity
            new Keyframe(0.2f, 1f + BackOvershootAmount, BackTangentStrength * 0.5f, -BackTangentStrength * 0.5f), // Overshoot forward
            new Keyframe(1f, 1f, 0f, 0f) // Settle at end
        );


        /// <summary>
        /// Starts with a backward overshoot, ends with a forward overshoot, then settles.
        /// Harder to do perfectly with few keys; this is a simplified visual.
        /// </summary>
        public static AnimationCurve EaseInOutBack => new AnimationCurve(
            new Keyframe(0f, 0f, 0f, 0f),
            new Keyframe(0.2f, -BackOvershootAmount * 0.5f, 0f, 0f),
            new Keyframe(0.8f, 1f + BackOvershootAmount * 0.5f, 0f, 0f),
            new Keyframe(1f, 1f, 0f, 0f)
        );


        // --- Quartic (t^4), Quintic (t^5) ---
        // These are essentially more pronounced versions of Quad and Cubic.
        // You can achieve this by making the tangents even steeper.

        public static AnimationCurve EaseInQuart => new AnimationCurve(new Keyframe(0f, 0f, 0f, 0f), new Keyframe(1f, 1f, 4f, 0f));
        public static AnimationCurve EaseOutQuart => new AnimationCurve(new Keyframe(0f, 0f, 0f, 4f), new Keyframe(1f, 1f, 0f, 0f));
        public static AnimationCurve EaseInOutQuart => EaseInOutSmooth;

        public static AnimationCurve EaseInQuint => new AnimationCurve(new Keyframe(0f, 0f, 0f, 0f), new Keyframe(1f, 1f, 5f, 0f));
        public static AnimationCurve EaseOutQuint => new AnimationCurve(new Keyframe(0f, 0f, 0f, 5f), new Keyframe(1f, 1f, 0f, 0f));
        public static AnimationCurve EaseInOutQuint => EaseInOutSmooth;


        // --- Elastic and Bounce ---
        // These are very difficult to represent convincingly with a small number of AnimationCurve keyframes.
        // They involve multiple oscillations and complex dampening or collision-like behaviors.
        // For Elastic and Bounce effects, it is strongly recommended to:
        // 1. Use direct mathematical formulas.
        // 2. Use a dedicated tweening library (like DOTween, LeanTween, etc.) which has these built-in.
        // 3. Create them visually in the AnimationCurve editor if you need that specific artist-driven feel.
        //
        // Therefore, presets for Elastic and Bounce are not provided here as simple AnimationCurve objects
        // because the approximations would likely be unsatisfactory.
    }
}
