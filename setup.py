import math
import sys
import io
import traceback
import ast
import js
from io import StringIO
from pylint import lint
from pylint.reporters.text import TextReporter
# from webloop import WebLoop
from _pyodide._base import CodeRunner
from pyodide.console import PyodideConsole
import __main__

import re

pyconsole = PyodideConsole(globals=__main__.__dict__, filename="<console>")

namespace = {}  # use separate namespace to hide run_code, modules, etc.


class WritableObject(object):
    "dummy output stream for pylint"

    def __init__(self):
        self.content = ""

    def write(self, st):
        "dummy write"
        self.content += st

    def read(self):
        "dummy read"
        return self.content


def test_code(code):
    fn = "test.py"

    with open(fn, "w") as f:
        f.write(code)

    pylint_output = WritableObject()
    lint.Run([fn], reporter=TextReporter(pylint_output), exit=False)

    result = pylint_output.read()

    print(result)

    run_out = run_code(code)
    pylint_out = filter_error_messages(result)

    if run_out.startswith("Traceback"):  # code was faulty and could not be run
        run_out = """
[EN] Something went wrong that prevented your code from executing, you probably have an error somewhere in your code. Check PyLint output below for feedback.

[NL] Er is iets fout gelopen waardoor je code niet uitgevoerd kon worden, waarschijnlijk heb je ergens een fout in je code. Check PyLint output hieronder voor feedback. 
"""

    out = f"""
PYTHON OUTPUT:
    {run_out}
---------------------------------
PYLINT OUTPUT:
    {pylint_out}
"""

    lint.pylinter.MANAGER.astroid_cache = {}

    return out


def run_code(code):
    newout = io.StringIO()
    newerr = io.StringIO()
    oldout = sys.stdout
    olderr = sys.stderr
    sys.stdout = newout
    sys.stderr = newerr
    try:
        output = exec(code, namespace)
    except:
        traceback.print_exc()

    sys.stdout = oldout
    sys.stderr = olderr
    errorMsg = newerr.getvalue()
    if len(errorMsg) == 0:
        return newout.getvalue()
    else:
        return errorMsg


def compile_code(code):
    newout = io.StringIO()
    newerr = io.StringIO()
    oldout = sys.stdout
    olderr = sys.stderr
    sys.stdout = newout
    sys.stderr = newerr
    try:
        CodeRunner(code).compile()
    except:
        traceback.print_exc()

    sys.stdout = oldout
    sys.stderr = olderr
    errorMsg = newerr.getvalue()
    if len(errorMsg) == 0:
        return newout.getvalue()
    else:
        return errorMsg


def get_ast(code):
    tree = ast.parse(code)
    return tree


def get_ast_dump(code):
    tree = ast.parse(code)
    dump = ast.dump(tree)
    return dump


def get_dump(node):
    return ast.dump(node)


def get_unparse(node):
    return ast.unparse(node)


def filter_error_messages(pylint_output: str) -> str:

    out = ""
    pattern = r".*:(\d*):(\d*): (\w+): (.*)"

    for line in pylint_output.split('\n'):

        if not line:
            continue
        elif line[0] == "*":
            continue
        elif line[0] == "-":
            break

        match = re.search(pattern, line)
        if match:
            error_code = match.group(3)

            if error_code[0] == "E":  # we are currently only interested in E error messages
                out += f"""
[EN] Line {match.group(1)}, column {match.group(2)}: [{error_code}] {match.group(4)}

[NL] Lijn {match.group(1)}, kolom {match.group(2)}: [{error_code}] {translate(error_code, match.group(4))}
"""

    return out


def translate(error_code: str, m: str) -> str:

    msg = m.upper()

    if error_code == "E0001":
        if "Perhaps you forgot a comma?".upper() in msg:
            return "Syntax fout: je bent waarschijnlijk ergens een komma vergeten."
        elif "unterminated string literal".upper() in msg:
            return "Syntax fout: onafgesloten string; strings moeten afgesloten worden met een \" of \'"
        elif "expected \":\"".upper() in msg:
            return "Syntax fout: \":\" verwacht; `if`/`else`/`elif`/`while`/`for`/`def`-statements moeten altijd gevolgd worden door een dubbelpunt (:)."
        elif "invalid character".upper() in msg:
            return "Syntax fout: je gebruikt hier een ongeldig teken."
        elif "Maybe you meant \'==\'".upper() in msg:
            return "Syntax fout: je hebt '=' gebruikt waar het niet mag, bedoelde je misschien '==' of ':='?"
        elif "unexpected indent".upper() in msg:
            return "Syntax fout: onverwachte inspringing (indent)."
        elif "expected an indented block".upper() in msg:
            return "Syntax fout: je bent hier een inspringing (indent) vergeten; code bijhorende bij `if`/`else`/`elif`/`while`/`for`/`def`-statements moeten altijd een inspringing hebben."
        elif "Missing parentheses".upper() in msg:
            return "Syntax fout: je bent haakjes vergeten bij je functie-oproep."
        elif "'(' was never matched".upper() in msg:
            return "Syntax fout: je hebt je haakje '(' nooit afgesloten."
        elif "unmatched ')'".upper() in msg:
            return "Syntax fout: je hebt je haakjes nooit geopend, je hebt een ')' te veel."
        elif "invalid decimal literal".upper() in msg:
            return "Syntax fout: ongeldig getal; je hebt non-decimalen gebruikt in je getal of je bent een variabele met een getal begonnen. Getallen kunnen enkel cijfers van 0 t.e.m. 9 bevatten en een underscore '_' om groepen te onderscheiden (dus een miljoen wordt 1_000_000), niets anders is toegelaten. Namen van variabelen kunnen ook nooit beginnen met getallen."
        elif "unindent does not match any outer indentation level".upper() in msg:
            return "Syntax fout: je indentatie komt niet overeen met de rest van je code; kijk nog eens goed na of je indentatie overal consistent is."
        elif "cannot assign to expression here".upper() in msg:
            return "Syntax fout: je hebt een enkele gelijkheidsteken (toewijzing aan variabele) '=' gebruikt waar het niet mag; bedoelde je misschien '==' om twee waarden met elkaar te vergelijken?"
        elif "leading zeros in decimal integer".upper() in msg:
            return "Syntax fout: getallen kunnen niet beginnen met nullen."
        else:
            return m

    elif error_code == "E0602":  # undefined variable
        p = r"Undefined variable '(.*)' .*"
        match = re.search(p, m)

        if match:
            return f"Ongedefinieerde variabele '{match.group(1)}'. Zorg dat je deze variabele eerst een waarde toekent vooraleer je ze gebruikt."
        else:
            return m

    elif error_code == "E0401":  # import error
        p = r"Unable to import '(.*)' .*"
        match = re.search(p, m)

        if match:
            return f"Ongeldige import; '{match.group(1)}' kon niet worden geïmporteerd, kijk na of je de naam juist hebt gespeld."
        else:
            return m

    elif error_code == "E1120":  # no value for parameter
        p = r"No value for argument '(.*)' .*"
        match = re.search(p, m)

        if match:
            return f"Geen waarde toegekend aan argument '{match.group(1)}' bij methode-oproep."
        else:
            return m

    elif error_code == "E0601":  # using variable before assignment
        p = r"Using variable '(.*)' .*"
        match = re.search(p, m)

        if match:
            return f"Variabele '{match.group(1)}' wordt gebruikt voor er een waarde aan toegekend wordt; zorg dat je eerst een waarde toekent aan de variabele vooraleer je deze gebruikt."
        else:
            return m

    elif error_code == "E1121":  # too many function arguments
        return "Je gebruikt te veel argumenten voor deze methode, kijk na of je de juiste methode gebruikt."

    else:
        return m
