from checker import Checker

class IPUChecker(Checker):
    name = "Improper Python Usage Checker"
    msg = ""
    help = ""

    def __init__(self):
        self.out = set()

    def check(self, f: str) -> {str}:
        self.used_before_assignment(f)
        return self.out

    def used_before_assignment(self, f: str):
        return None