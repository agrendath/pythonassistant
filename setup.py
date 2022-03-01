import sys, io, traceback
import ast
import js
from pylint import lint
from pylint.reporters.text import TextReporter
# from webloop import WebLoop
from _pyodide._base import CodeRunner
from pyodide.console import PyodideConsole
import __main__

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

    return result


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
