class RankService:

    def calculate_level(self, xp: int) -> int:
        return xp // 100

    def calculate_rank(self, level: int) -> str:
        if level < 5:
            return "Seed"
        elif level < 10:
            return "Sprout"
        elif level < 20:
            return "Tree"
        else:
            return "Forest"