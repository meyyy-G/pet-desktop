def need_severity(value: int) -> int | None:
    if value <= 15:
        return 15
    if value <= 25:
        return 25
    if value <= 50:
        return 50
    return None


def highest_need_severity(
    satiety: int,
    mood: int,
    energy: int,
) -> int | None:
    severities = (
        need_severity(satiety),
        need_severity(energy),
        need_severity(mood),
    )
    active = [severity for severity in severities if severity is not None]
    return min(active) if active else None


def resolve_need_animation(
    satiety: int,
    mood: int,
    energy: int,
) -> str | None:
    """Return one body animation, preferring severity before need order."""
    rules = (
        (15, ((satiety, "sick"), (energy, "sleep"), (mood, "sick"))),
        (25, ((satiety, "angry"), (energy, "sleepy"), (mood, "cry"))),
        (50, ((satiety, "upset"), (energy, "sleepy"), (mood, "upset"))),
    )

    for threshold, candidates in rules:
        for value, animation in candidates:
            if value <= threshold:
                return animation

    return None


def resolve_persistent_hint(
    satiety: int,
    mood: int,
    energy: int,
) -> str | None:
    """Preserve the existing thought-bubble rules independently of body animation."""
    if satiety <= 15 or mood <= 15:
        return "sick"
    if satiety <= 25 and mood <= 25 and energy <= 25:
        return "upset"
    if satiety <= 25:
        return "angry"
    if satiety <= 50:
        return "hungry"
    if energy <= 25:
        return "sleep"
    if mood <= 50:
        return "upset"
    return None


def resolve_transient_hint(
    old_values: tuple[int, int, int],
    new_values: tuple[int, int, int],
) -> str | None:
    old_satiety, _, old_energy = old_values
    satiety, _, energy = new_values
    if old_satiety > 75 >= satiety:
        return "hungry"
    if old_energy > 50 >= energy:
        return "sleep"
    return None
