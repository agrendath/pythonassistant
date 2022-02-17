from checker import Checker

class ColonChecker(Checker):
    name = "colon-checker"
    msg = "Colon expected on line %s."
    help = ""

    def check(self, f: str) -> {str}:
        keywords = {"def", "while", "for", "if", "elif", "else"}
        out = set()
        lineno = 0

        lines = f.split('\n')

        for line in lines:
            words = line.split()

            if any(x in keywords for x in words) and line.strip()[-1] != ":":
                out.add(f"Colon expected on line {lineno}.")
            lineno += 1

        return out
