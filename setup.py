from cProfile import run
from configparser import LegacyInterpolation
from distutils.log import debug
from doctest import debug_script
import math
from pickle import TRUE
import sys
import io
import traceback
import ast
import js
import os
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

DEBUG = True  # set to True to get verbose output in the browser console


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


def test_and_run(code: str) -> str:
    pylint_broke = False  # flag that tracks whether pylint broke or not
    run_out = run_code(code)
    error_out = ""

    try:
        pylint_out = test_code(code)
    except Exception as e:  # defaults to python output if pylint throws an exception
        if DEBUG:
            print(f"""
PYLINT BROKE
    Error message:
            
    {e}
""")
        pylint_broke = True
        pylint_out = """
Er is iets fout gelopen met PyLint, probeer opnieuw.
"""
    # prints python output in console, useful for debugging
    # if DEBUG:
    #     print("PYTHON OUTPUT:", run_out)

    # code was faulty and could not be run, replacing standard python error messages with pylint error messages
    if run_out.startswith("Traceback") and not pylint_broke:
        error_out = run_out
        run_out = """
Er is iets fout gelopen waardoor je code niet uitgevoerd kon worden, waarschijnlijk heb je ergens een fout in je code. Check PyLint output hieronder voor feedback. 
"""

    out = f"""
PYTHON OUTPUT:
    {run_out}
---------------------------------
PYLINT OUTPUT:
    {pylint_out}
---------------------------------
PYTHON ERROR OUTPUT:
    {error_out}
"""

    return out


def test_code(code):
    fn = "test.py"

    with open(fn, "w") as f:
        f.write(code)

    pylint_output = WritableObject()
    lint.Run([fn], reporter=TextReporter(pylint_output), exit=False)

    result = pylint_output.read()

    if DEBUG:
        print(result)  # prints full pylint output without filtering

    pylint_out = filter_error_messages(result, code.split('\n'))

    lint.pylinter.MANAGER.astroid_cache = {}

    return pylint_out


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


def filter_error_messages(pylint_output: str, code) -> str:
    out = ""
    # pattern that matches with pylint error messages, captures: (1) line, (2) column, (3) error code, and (4) message
    pattern = r".*:(\d*):(\d*): (\w+): (.*)"
    counter = 1

    for line in pylint_output.split('\n'):

        if not line:
            continue
        elif line[0] == "*":
            continue
        elif line[0] == "-":
            break

        match = re.search(pattern, line)
        lineno = int(match.group(1))
        colno = int(match.group(2))
        if match:
            error_code = match.group(3)

            if error_code[0] == "E":  # we are currently only interested in E error messages
                out += f"""
{counter}. Lijn {lineno}, kolom {colno}: [{error_code}] {translate(error_code, match.group(4), code[lineno-1], colno)}
"""
                counter += 1

    return out


def translate(error_code: str, m: str, line: str, colno: int) -> str:

    msg = m.upper()

    out = f"""
{line}
{(colno - 1) * " "}^

"""

    if error_code == "E0001":
        if "Perhaps you forgot a comma?".upper() in msg:
            out += "Syntax fout: je bent waarschijnlijk ergens een komma vergeten."
        elif "unterminated string literal".upper() in msg:
            out += "Syntax fout: onafgesloten string; strings moeten afgesloten worden met een \" of \'"
        elif "expected ':'".upper() in msg:
            statement = get_statement(line)
            out += f"Syntax fout: \":\" verwacht bij je `{statement}`-statement; `if`/`else`/`elif`/`while`/`for`/`def`-statements moeten altijd gevolgd worden door een dubbelpunt (:)."
        elif "invalid character".upper() in msg:
            p = r"invalid character '(.)' .*"
            match = re.search(p, m)

            if match:
                out += f"Syntax fout: je gebruikt hier een ongeldig teken, namelijk '{match.group(1)}'."
            else:
                out += "Syntax fout: je gebruikt hier een ongeldig teken."
        elif "Maybe you meant \'==\'".upper() in msg:
            out += "Syntax fout: je hebt '=' gebruikt waar het niet mag, bedoelde je misschien '==' of ':='?"
        elif "unexpected indent".upper() in msg:
            out += "Syntax fout: onverwachte inspringing (indent)."
        elif "expected an indented block".upper() in msg:
            out += "Syntax fout: je bent hier een inspringing (indent) vergeten; code bijhorende bij `if`/`else`/`elif`/`while`/`for`/`def`-statements moeten altijd een inspringing hebben."
        elif "Missing parentheses".upper() in msg:
            out += "Syntax fout: je bent haakjes vergeten bij je functie-oproep."
        elif "'(' was never matched".upper() in msg:
            out += "Syntax fout: je hebt je haakje '(' nooit afgesloten."
        elif "unmatched ')'".upper() in msg:
            out += "Syntax fout: je hebt je haakjes nooit geopend, je hebt een ')' te veel."
        elif "invalid decimal literal".upper() in msg:
            out += "Syntax fout: ongeldig getal; je hebt non-decimalen gebruikt in je getal of je bent een variabele met een getal begonnen. Getallen kunnen enkel cijfers van 0 t.e.m. 9 bevatten en een underscore '_' om groepen te onderscheiden (dus een miljoen wordt 1_000_000), niets anders is toegelaten. Namen van variabelen kunnen ook nooit beginnen met getallen."
        elif "unindent does not match any outer indentation level".upper() in msg:
            out += "Syntax fout: je indentatie komt niet overeen met de rest van je code; kijk nog eens goed na of je indentatie overal consistent is."
        elif "cannot assign to expression here".upper() in msg:
            out += "Syntax fout: je hebt een enkele gelijkheidsteken (toewijzing aan variabele) '=' gebruikt waar het niet mag; bedoelde je misschien '==' om twee waarden met elkaar te vergelijken?"
        elif "leading zeros in decimal integer".upper() in msg:
            out += "Syntax fout: getallen kunnen niet beginnen met nullen."
        elif "EOL while scanning string literal".upper() in msg:
            out += "Syntax fout: onafgesloten string; strings moeten afgesloten worden met een \" of \'"
        else:
            out += "Syntax fout: PyLint kon je fout niet vinden. De meest voorkomende fouten zijn: komma ',' vergeten tussen o.a. parameters, dubbelpunt ':' vergeten aan het einde van een statement, ongeldig karakter gebruikt, '=' gebruikt i.p.v. '=='; dus kijk deze zeker goed na."

    elif error_code == "E0602":  # undefined variable
        p = r"Undefined variable '(.*)' .*"
        match = re.search(p, m)

        if match:
            out += f"Ongedefinieerde variabele '{match.group(1)}'. Zorg dat je deze variabele eerst een waarde toekent vooraleer je ze gebruikt."
        else:
            out += m

    elif error_code == "E0401":  # import error
        p = r"Unable to import '(.*)' .*"
        match = re.search(p, m)

        if match:
            out += f"Ongeldige import; '{match.group(1)}' kon niet worden geïmporteerd, kijk na of je de naam juist hebt gespeld."
        else:
            out += m

    elif error_code == "E1120":  # no value for parameter
        p = r"No value for argument '(.*)' .*"
        match = re.search(p, m)

        if match:
            out += f"Geen waarde toegekend aan argument '{match.group(1)}' bij methode-oproep."
        else:
            out += m

    elif error_code == "E0601":  # using variable before assignment
        p = r"Using variable '(.*)' .*"
        match = re.search(p, m)

        if match:
            out += f"Variabele '{match.group(1)}' wordt gebruikt voor er een waarde aan toegekend wordt; zorg dat je eerst een waarde toekent aan de variabele vooraleer je deze gebruikt."
        else:
            out += m

    elif error_code == "E1121":  # too many function arguments
        out += "Je gebruikt te veel argumenten voor deze methode, kijk na of je de juiste methode gebruikt."

    else:
        out += m

    return out


def get_statement(line: str) -> str:

    p = r"(\w*) .*"
    match = re.search(p, line.strip())

    if match:
        return match.group(1)

    return ""
