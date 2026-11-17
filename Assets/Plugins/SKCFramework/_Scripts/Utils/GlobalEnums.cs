namespace SKC.Global
{
    public enum GameState
    {
        Initializing,
        Idle,
        Loading,
        Playing,
        Paused,
        GameOver
    }

    public enum TransitionType
    {
        FadeIn,
        FadeOut,
        Both
    }
}