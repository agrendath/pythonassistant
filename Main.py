from checkers import IPUChecker


def main():
    print("Starting pythonassistant...")
    f = open("test.py")
    code = f.read()

    run_checkers()


def run_checkers(code: str) -> {str}:
    checkers = [IPUChecker()]
    out = set()

    for checker in checkers:
        out.union(checker.check(code))

    return out


if __name__ == "__main__":
    main()
