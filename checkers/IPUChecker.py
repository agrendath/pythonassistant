from checker import Checker

class IPUChecker(Checker):
    name = "Improper Python Usage Checker"
    msg = ""
    help = ""

    def check(self, f: str) -> {str}:
        used_before_assignment(f)

    def used_before_assignment():
        return None