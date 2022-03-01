const codeField = document.getElementById("code");
const outputField = document.getElementById("output");
const runButton = document.getElementById("run");
const compileButton = document.getElementById("compile");
const astButton = document.getElementById("ast");
const printField = document.getElementById("terminal");

const worker = new Worker("worker.js");

async function init() {
    runButton.setAttribute("disabled", true)
    compileButton.setAttribute("disabled", true)
    astButton.setAttribute("disabled", true)
    worker.onmessage = (e) => {
        runButton.removeAttribute("disabled")
        compileButton.removeAttribute("disabled")
        astButton.removeAttribute("disabled")
    }
    worker.postMessage({type: 'init', code: ''})
}
init()

async function run() {
    worker.onmessage = (e) => {
        outputField.value = e.data.result
    }
    worker.postMessage({type: 'run', code: codeField.value})
}

async function compile() {
    worker.onmessage = (e) => {
        outputField.value = e.data.result
    }
    worker.postMessage({type: 'compile', code: codeField.value})
}

async function ast() {
    worker.onmessage = (e) => {
        if (e.data.type == 'ast_dump') {
            console.log("AST")
            outputField.value = e.data.value
        } else if (e.data.type == 'output') {
            console.log("OUTPUT")
            printField.value = printField.value + e.data.value;
        } else if (e.data.type == 'input') {
            console.log("INPUT")
            var result = prompt('Geef een invoer:','');
            printField.value = printField.value + '>>> ' + result + '\n';
            console.log("INPUT READY")
            console.log(result)
            worker.postMessage({type: 'input_ready', code: result});
        } 
    }
    worker.postMessage({type: 'ast', code: codeField.value})
}

