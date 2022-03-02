import sys
import io
import traceback
import ast
import js
from pylint import lint
from pylint.reporters.text import TextReporter
# from webloop import WebLoop
from _pyodide._base import CodeRunner
from pyodide.console import PyodideConsole
import __main__

import re
# from translate import Translator

pyconsole = PyodideConsole(globals=__main__.__dict__, filename="<console>")

namespace = {}  # use separate namespace to hide run_code, modules, etc.


class WritableObject(object):
    "dummy output stream for pylint"

    def __init__(self):
        self.content = []

    def write(self, st):
        "dummy write"
        self.content.append(st)

    def read(self):
        "dummy read"
        return self.content


def test_code(code):
    with open("test.py", "w") as f:
        f.write(code)

    pylint_output = WritableObject()
    lint.Run(["test.py"], reporter=TextReporter(pylint_output), exit=False)

    result = ""
    for l in pylint_output.read():
        result += l

    run_out = run_code(code)
    pylint_out = filter_error_messages(result)

    if run_out.startswith("Traceback"):  # code was faulty and could not be run
        run_out = """
[EN] Something went wrong that prevented your code from executing, you probably have an error somewhere in your code. Check PyLint output below for feedback.

[NL] Er is iets fout gelopen waardoor je code niet uitgevoerd kon worden, waarschijnlijk heb je ergens een fout in je code. Check PyLint uitvoer hieronder voor feedback. 
"""

    out = f"""
PYTHON OUTPUT:
    {run_out}
---------------------------------
PYLINT OUTPUT:
    {pylint_out}
"""

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

    translator = Translator(to_lang="nl")

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
                #                 out += f"""
                # [EN] Line {match.group(1)}: [{error_code}] {match.group(4)}

                # [NL] Lijn {match.group(1)}: [{error_code}] {translator.translate(match.group(4))}
                # """
                out += f"""
[EN] Line {match.group(1)}: [{error_code}] {match.group(4)}

[NL] Lijn {match.group(1)}: [{error_code}] {match.group(4)}
"""

    return out
