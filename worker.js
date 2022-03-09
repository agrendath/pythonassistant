importScripts('interpreter.js')

let pyodide = undefined;

self.inputContinuation = () => {}

async function init(){
    // Step 1. Load pyodide
    // const indexURL = "https://cdn.jsdelivr.net/pyodide/v0.18.0a1/full/"
    const indexURL = "./pyodide/"
    importScripts(indexURL + 'pyodide.js')
    pyodide = await loadPyodide({
        indexURL : "./pyodide/"
    });

    await pyodide.loadPackage("micropip");
    await pyodide.loadPackage("lazy-object-proxy");
    await pyodide.loadPackage("wrapt");
    await pyodide.runPythonAsync(`
    import micropip
    await micropip.install('pylint')
    await micropip.install('astroid')
    await micropip.install('platformdirs')
    await micropip.install('isort')
    await micropip.install('toml')
    print('done')
    `);

    // Step 2. Load our python code
    const getr = new XMLHttpRequest();
		getr.open('GET', 'setup.py', true);
		getr.send(null);
		getr.onreadystatechange = async function () {
			try {
				const setup_code = getr.responseText;
				await pyodide.runPython(setup_code);
			} catch (exc) {
				console.log(exc);
			}
		}
    // Step 3. Notify of completion
    self.postMessage({})
}

let ctr = 0;

function run(code) {
    pyodide.globals.set('code_to_run', code)
    pyodide.globals.set('n', ctr)
    let output = pyodide.runPython('test_code(code_to_run, n)')
    ctr++;
    self.postMessage({ result: output })
}

function compile(code) {
    pyodide.globals.set('code_to_run', code)
    let output = pyodide.runPython('compile_code(code_to_run)')
    self.postMessage({ result: output })
}

async function ast(code) {
    pyodide.globals.set('code_to_run', code)
    var myObject = pyodide.runPython('get_ast(code_to_run)')
    var astDump = pyodide.runPython('get_ast_dump(code_to_run)')
    self.postMessage({ type: 'ast_dump', value: astDump })
    // pyodide.globals.set('code_to_run', myObject.body)
    interpretAST(myObject, undefined, false)
}

self.requestInput = (env, fcont) => {
    self.inputContinuation = async function (value) { fcont(value, env); };
    self.postMessage({ type: 'input' })
}

self.presentOutput = async (value) => {
    self.postMessage({ type: 'output', value: value})
    await delay(500);
}

self.presentRuntimeError = async (value) => {
    self.postMessage({ type: 'output', value: value})
    await delay(500);
}

self.notifyComplete = (env) => {
    console.log(env)
    self.postMessage({ type: 'complete' })
}

self.onmessage = async (event) => {
    const { type, code, ...context } = event.data;
    try {
        if (type == 'init') {
            init(code)
        } else if (type == 'run') {
            run(code)
        } else if (type == 'compile') {
            compile(code)
        } else if (type == 'ast') {
            ast(code)
        } else if (type == 'input_ready') {
            self.inputContinuation(code)
        } else {
            console.log("unknown type:")
            console.log(type)
        }
    } catch (error) {
        self.postMessage({ error: error.message });
    }
};
