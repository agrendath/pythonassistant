
// --------------- //
// AST INTERPRETER //
// --------------- //

/*

    TODO
    ====

    - support break and continue in for loops
    - runtime checks for type errors
    - garbage collection

 */

/*
function logMe(msg) {
  console.log(msg)
}
*/

function logMe(msg) { }

async function basic_timeout_cont() {
    presentRuntimeError('TIMEOUT: De uitvoering van je programma duurde meer dan 2 minuten en werd afgebroken.\n');
}

async function checkTimeout(env, cont) {
  /* console.log('time: ', new Date().getTime() - env.startTime) */
  if (new Date().getTime() > env.startTime + 60000) {
    env.timeout_cont()
  } else {
    return function () { return cont(env) }
  }
}

async function basic_error_cont(env, msg) {
    let node = env.nodestack.pop()
    pyodide.globals.set('code_to_run', node)
    var astDump = pyodide.runPython('get_unparse(code_to_run)') 
    presentRuntimeError('ERROR: ' + msg + '\n' + 
                        '       Op regel ' + node.lineno +':\n' +
                        astDump + '\n');
}

async function interpretAST(tree, env, inTerminal) {
    logMe('interpretAST')
    logMe(env)
    if (env == undefined) {
        env = {vars: [ new Map() ] 
             , funs: new Map()
             , continue_cont: async function (env3) { env3.error_cont(env3, '\'continue\' buiten lus'); } 
             , break_cont: async function (env3) { env3.error_cont(env3, '\'break\' buiten lus'); } 
             , return_cont: async function (x, env3) { logMe(env3); env3.error_cont(env3, '\'return\' buiten functie'); } 
             , error_cont: basic_error_cont 
             , globals: [ new Set() ]
             , startTime: new Date().getTime()
             , timeout_cont: basic_timeout_cont
             , imports: new Set()
             , importfuns: new Map()
             , step: true
             , nodestack: [ tree ]
             };
    }
    env.inTerminal = inTerminal
    logMe(env)
    logMe(env.vars[0].size)
    trampoline(function () { return interpretModule(tree, env, async function (env2) {
      logMe('THE END')
      self.notifyComplete(env2)}) })
}

async function trampoline (cont) {
  do {
    cont = await cont();
    logMe('trampoline: ' + cont)
  } while (cont != undefined)
}

async function stepCont(node, env, cont) {
  if (env.step) {
    console.log(node.lineno + ':' + node.col_offset + ' - ' + node.end_lineno + ':' + node.end_col_offset)
  }
  return function () { return cont(env) }
}

async function interpretModule(module, env, cont) {
  logMe(env)
  return function () { return interpretBlock(module.body, env, cont) }
}

async function interpretBlock(list, env, cont) {
    logMe('interpretBlock')
    return function () { return interpretBlockAux(0, list, env, destroyCont(list, cont)) }
}

async function interpretBlockAux(i, list, env, cont) {
  logMe('interpretBlockAux')
  if (i < list.length) {
    return function () { 
      return interpretStatement(list.get(i), env, async function (env2) {
          return interpretBlockAux(i+1, list, env2, cont)
        }
      )
    }
  } else {
    logMe('Finish interpretBlockAux')
    logMe(cont)
    return function () { return cont(env) };
  } 
}

async function interpretStatement(stmt, env, cont) {
  logMe('interpretStatement')
  logMe(env.vars.toString())
  env.nodestack.push(stmt)
  return function () {
    return stepCont(stmt, env, async function (env) {
      return interpretStatement_(stmt, env, destroyCont(stmt,cont))
    })
  }
}

async function interpretStatement_(stmt, env, cont) {
    logMe(stmt.__class__.__name__)
    switch(stmt.__class__.__name__) {
        case 'Assign':
            return function () { 
              return interpretAssign(stmt.targets, stmt.value, env, cont);
            }
        case 'AugAssign':
            return function () { 
              return interpretAugAssign(stmt.target, stmt.op, stmt.value, env, cont);
	    }
        case 'Break':
            return function () { 
              return interpretBreak(env, cont)
            }
        case 'Continue':
            return function () { 
              return interpretContinue(env, cont)
            }
        case 'Expr':
            return function () { return interpretExpr(stmt.value, env, cont); }
        case 'For':
            return function () { 
              return interpretFor(stmt.target, stmt.iter, stmt.body, env, cont)
            }
        case 'FunctionDef':
            return function () { 
              return interpretFunctionDef(stmt.name, stmt.args, stmt.body, env, cont)
            }
        case 'Global':
            return function () { 
              return interpretGlobal(stmt.names, env, cont)
            }
        case 'If':
            return function () { 
              return interpretIf(stmt.test, stmt.body, stmt.orelse, env, cont)
            }
        case 'Import':
            return function () { 
              return interpretImport(stmt.names, env, cont)
            }
        case 'ImportFrom':
            return function () { 
              return interpretImportFrom(stmt.module, stmt.names, env, cont)
            }
        case 'Pass':
	    return function () { 
              return cont(env);
            }
        case 'Return':
            return function () { 
              return interpretReturn(stmt.value, env, cont)
            }
        case 'While':
            return function () { 
              return interpretWhile(stmt.test, stmt.body, stmt.orelse, env, cont)
            }
        default:
            pyodide.globals.set('code_to_run', stmt)
            var astDump = pyodide.runPython('get_unparse(code_to_run)') 
            env.error_cont(env, 'Niet-ondersteunde instructie: \n' + astDump) 
    } 
}

async function interpretExpr(value, env, cont) {
  logMe('interpretExpr')
  // skip interpretExpression because Expr statement has already stepped as statement
  return function () { return interpretExpression_(value, env, async function (x, env2) { 
      if (env.inTerminal && x !== undefined) {
        await self.presentOutput(myToString(x) + '\n')
      }
      value.destroy()
      return function () { return cont(env2) }
    });
  }
}


async function interpretGlobal(names, env, cont) {
  for (i = 0; i < names.length; i++) {
    env.globals[0].add(names.get(i))
  }
  return function () { return cont(env) }
}

async function interpretFunctionDef(name, args, body, env, cont) {
  logMe(args)
  logMe(body)
  env.funs.set(name, {args: args.copy(), body: body.copy()})
  return function () { return cont(env) }
}

async function interpretIf(test, body, orelse, env, cont) {
  return function () { 
    return interpretExpression(test, env, async function (t, env2) {
      if (t) {
        return function () { return interpretBlock(body, env2, cont) }
      } else {
        return function () { return interpretBlock(orelse, env2, cont) }
      }
    })
  }
}

async function interpretImportFrom(module, names, env, cont) {
  if (module==='math') {
      for (i = 0; i < names.length; i++) {
        let name = names.get(i).name
        switch (name) { 
          case 'sqrt':
            env.importfuns.set('sqrt', interpretSqrt);
            break;
          default:
            env.error_cont(env, 'Import uit de math module onbekend of niet ondersteund: ' + name)
        }
      }
      return function () { return cont(env) }
  } else if (module === 'random') {
      for (i = 0; i < names.length; i++) {
        let name = names.get(i).name
        switch (name) { 
          case 'random':
            env.importfuns.set('random', interpretRandom);
            break;
          case 'randint':
            env.importfuns.set('randint', interpretRandint);
            break;
          case 'choice':
            env.importfuns.set('choice', interpretChoice);
            break;
          default:
            env.error_cont(env, 'Import uit de random module onbekend of niet ondersteund: ' + name)
        }
      }
      return function () { return cont(env) }
  } else if (module === 'datetime') {
      for (i = 0; i < names.length; i++) {
        let name = names.get(i).name
        switch (name) { 
          case 'date':
            env.importfuns.set('date', true);
            break;
          default:
            env.error_cont(env, 'Import uit de random module onbekend of niet ondersteund: ' + name)
        }
      }
      return function () { return cont(env) }
  } else {
      env.error_cont(env, 'Import van onbekende of niet ondersteunde module: ' + module)
  }
}

async function interpretImport(names, env, cont) {
  for (i = 0; i < names.length; i++) {
    let name = names.get(i).name
    if (name === 'math' || name === 'calendar' || name === 'datetime' || name === 'random') {
      env.imports.add(name)
    } else {
      env.error_cont(env, 'Import van onbekende of niet ondersteunde module: ' + name)
    }
  }
  return function () { return cont(env) }
}


async function interpretFor(target, iter, body, env, cont) {
  if (target.__class__.__name__ == "Name") {
    return function () {
      return interpretExpression(iter, env, async function (iterable, env2) {
        var sentinel = pyodide.runPython('object()')
        pyodide.globals.set('arg1', iterable)
        var iterator = pyodide.runPython('iter(arg1)')
        return function () {
          return interpretForAux(iterator, sentinel, target, body, env2, cont)
        }
      });
    }
  } else {
    env.error_cont(env, 'Niet-ondersteunde for-variable.\n') 
  }
}

async function interpretForAux(iterator, sentinel, target, body, env, cont) {
  pyodide.globals.set('arg1', iterator)
  pyodide.globals.set('arg2', sentinel)
  var item = pyodide.runPython('next(arg1,arg2)')
  pyodide.globals.set('arg1', item)
  var b = pyodide.runPython('arg1 is arg2')
  if (b) {
    return function () { return cont(env) }
  } else {
    return function () {
      return storeTarget(target, item, env, async function (env2) {
        return function () {
          return interpretBlock(body, env2, async function (env3) { 
            return function () {
              return interpretForAux(iterator, sentinel, target, body, env3, cont)
            }
          });
        }
      });
    }
  }
}

async function interpretWhile(test, body, orelse, env, cont) {
  logMe('interpretWhile')
  return function () {
    return checkTimeout(env, async function (env) {
      return function () {
        return interpretExpression(test, env, async function (t, env2a) {
            if (t) {
              var continue_cont_old = env2a.continue_cont  
              var break_cont_old = env2a.break_cont
              var continue_cont_new = async function (env3a) {
                 env3b = {...env3a, continue_cont: continue_cont_old, break_cont: break_cont_old }
                 return function () { 
                   return interpretWhile(test, body, orelse, env3b, cont)
                 }
              }
              var break_cont_new = async function (env4a) {
                 env4b = {...env4a, continue_cont: continue_cont_old, break_cont: break_cont_old }
                 return function () {
                   return cont(env4b)
                 }
              }
              var env2b = {...env2a, continue_cont: continue_cont_new, break_cont: break_cont_new }
              return function () {
                return interpretBlock(body, env2b, continue_cont_new)
              }
            } else {
              test.destroy()
              body.destroy()
              return function () {
                return interpretBlock(orelse, env2a, destroyCont(orelse,cont));
              }
            }
          }
        )
      }
    })
  }
}

async function interpretContinue(env, cont) {
  return function () { return env.continue_cont(env) }
}


async function interpretBreak(env, cont) {
  return function () { return env.break_cont(env) }
}



async function interpretReturn(value, env, cont) {
  logMe(env.return_cont)
  let return_node = env.node
  return function () { return interpretExpression(value, env, 
    function (val, env1) {
      env1.node = return_node
      return env1.return_cont(val, env1)
    })
  }
}


async function interpretAssign(targets, value, env, cont) {
    logMe('interpretAssign')
    if (targets.length == 1) {
        let target = targets.get(0)
        logMe(target.id)
        return function () { 
          return interpretExpression(value, env, async function(x, env2) {
            logMe("***")
            logMe(target.id)
            logMe(targets.get(0).id)
            return function () { return storeTarget(target, x, env2, cont); }
          })
        }
    } else {
        env.error_cont(env, 'Toekenning aan te veel variabelen') 
    }
}

async function interpretAugAssign(target, op, value, env, cont) {
    logMe('interpretAugAssign')
    return function () {
      return interpretExpression(target, env, async function(x, env2) {
        return function () {
          return interpretExpression(value, env2, async function(y, env3) {
            return function () {
              return interpretOp(op, x, y, env3, async function (z, env4) {
                return function () {
                  return storeTarget(target, z, env4, cont);
                }
              })
            }
          })
        }
      })
    }
}

async function storeTarget(target, x, env, cont) {
  logMe("storeTarget")
  logMe(target.__class__.__name__)
  switch (target.__class__.__name__) {
    case 'Name':
      logMe(target.id)
      if (env.globals[0].has(target.id)) {
        env.vars[env.vars.length-1].set(target.id, x)
      } else {
        env.vars[0].set(target.id, x)		
      }
      logMe(env.vars[0])
      return function () { return cont(env) }
    case 'Tuple':
      if (x.__class__ != undefined && x.__class__.__name__ == 'tuple') {
        if (x.length == target.elts.length) {
          return function () {
            return storeTargets(target.elts, x, 0, env, cont)
          }
        } else {
          return env.error_cont(env, 'Aantal elementen komt niet overeen bij tupeltoekenning. Gegeven: ' + x.length + '; verwacht: ' + target.elts.length + '.') 
        }
      } else {
        return env.error_cont(env, 'Toekenning van niet-tupel aan tupel: ' + myToString(x) + '.') 
      }
    default:
      return env.error_cont(env, 'Toekenning aan niet-ondersteunde entiteit.') 
  }
}

async function storeTargets(targets, values, index, env, cont) {
  if (index >= targets.length) {
    return function () { return cont(env) }
  } else {
    return function () {
      return storeTarget(targets.get(index), values.get(index), env, 
        async function (env1) { 
          return storeTargets(targets, values, index + 1, env1, cont)
        }
      )
    }
  }
}

async function interpretExpression(expr, env, fcont) {
  logMe(env.vars)
  return function () { 
    return stepCont(expr, env, async function (env) { 
      return interpretExpression_(expr, env, destroyFCont(expr,fcont)) })
  }
}

async function interpretExpression_(expr, env, fcont) {
    logMe('interpretExpression')
    logMe(env)
    logMe(expr.__class__.__name__)
    env.nodestack.push(expr)
    switch(expr.__class__.__name__) {
        case 'Attribute':
            return function () {
              return interpretAttribute(expr.value, expr.attr, expr.ctx, env, fcont);
            }
        case 'BinOp':
            return function () {
	      return interpretBinOp(expr.left, expr.op, expr.right, env, fcont)
	    }
        case 'BoolOp':
            return function () {
              return interpretBoolOp(expr.op, expr.values, env, fcont)
            }
        case 'Call':
            return function () {
              return interpretCall(expr.func, expr.args, expr.keywords, env, fcont)
            }
        case 'Compare':
            return function () {
              return interpretCompare(expr.left, expr.ops, expr.comparators, env, fcont)
            }
        case 'Constant':
            return function () {
              return interpretConstant(expr.value, env, fcont)
	    }
        case 'List':
            return function () {
              return interpretList(expr.elts, expr.ctx, env, fcont)
            }
        case 'Name':
            return function () {
              return interpretName(expr.id, env, fcont)
            }
        case 'Tuple':
            return function () {
              return interpretTuple(expr.elts, expr.ctx, env, fcont)
            }
        case 'UnaryOp':
            return function () {
	      return interpretUnaryOp(expr.op, expr.operand, env, fcont)
	    }
        default:
            env.error_cont(env, 'Niet-ondersteunde uitdrukking.') 
    }
}

function destroyCont(obj, cont) {
  return async function (env) {
    logMe('destroyCont')
    env.nodestack.pop()
    obj.destroy()
    logMe(cont)
    return function () { return cont(env) }
  }
}

function destroyFCont(obj, fcont) {
  logMe('destroyFCont')
  return async function (x, env) {
    env.nodestack.pop()
    obj.destroy()
    return function () { return fcont(x, env) }
  }
}

async function interpretAttribute(value, attr, ctx, env, fcont) {
  switch (value.__class__.__name__) {
    case 'Name':
      if (value.id === 'math') {
          if (env.imports.has('math')) {
              if (attr === 'pi') {
                return function () {
                  return fcont(Math.PI,env)
                }
              } else {
                env.error_cont(env, 'Niet-ondersteund attribuut in de math module: ' + attr) 
              }
          } else {
            env.error_cont(env, 'Het programma importeert de math module niet.') 
          }
      } else {
          env.error_cont(env, 'Niet-ondersteund attribuut: ' + value.id) 
      }
      break;
    default:
      env.error_cont(env, 'Niet-ondersteund attribuut.') 
  }
}

async function interpretCall(func, args, keywords, env, fcont) {
    logMe('interpretCall');
    logMe(func.__class__.__name__);
    switch(func.__class__.__name__) {
        case 'Attribute':
            return function () {
              return interpretAttributeCall(func.value, func.attr, func.ctx, args, env, fcont)
            }
        case 'Name':
            return function () { 
              return interpretNamedCall(func.id, args, keywords, env, fcont)
            }
        default:
            env.error_cont(env, 'Niet-ondersteunde oproep.') 
    }
}


async function interpretNamedCall(id, args, keywords, env, fcont) {
    logMe('interpretNamedCall');
    if (env.funs.has(id)) {
	return function () { return interpretUserDefinedFunctionCall(id, args, keywords, env, fcont) }
    } else if (env.importfuns.has(id)) {
        return function () { return env.importfuns.get(id)(args, env, fcont) }
    } else {
	switch(id) {
	    case 'chr':
                return function () {
		  return interpretChr(args, keywords, env, fcont);
		}
	    case 'float':
                return function () {
		  return interpretFloat(args, keywords, env, fcont);
		}
	    case 'input':
                return function () {
		  return interpretInput(args, keywords, env, fcont);
		}
	    case 'int':
                return function () {
		  return interpretInt(args, keywords, env, fcont);
		}
	    case 'len':
                return function () {
		  return interpretLen(args, keywords, env, fcont);
		}
            case 'max':
                return function () {
                  return interpretArgs(0,args,[],env,async function (list, env2) {
                    let txt = '';
                    for (var i = 0; i < list.length; i++) {
                       let name = 'arg' + i;
                       pyodide.globals.set(name, list[i])
                       if (i > 0) {
                         txt = txt + ',' + name;
                       } else {
                         txt = name;
                       }    
                    }
                    let output = pyodide.runPython('max('+ txt +')')
                    return function () { return fcont(output, env2) }
                  })
                }
            case 'min':
                return function () {
                  return interpretArgs(0,args,[],env,async function (list, env2) {
                    let txt = '';
                    for (var i = 0; i < list.length; i++) {
                       let name = 'arg' + i;
                       pyodide.globals.set(name, list[i])
                       if (i > 0) {
                         txt = txt + ',' + name;
                       } else {
                         txt = name;
                       }    
                    }
                    let output = pyodide.runPython('min('+ txt +')')
                    return function () { fcont(output, env2) }
                  })
                }
	    case 'ord':
                return function () {
		  return interpretOrd(args, keywords, env, fcont);
		}
	    case 'print':
		return function () { return interpretPrint(args, keywords, env, fcont); }
            case 'round':
                if (args.length == 2) {
                  return function () {
                    return interpretBuiltin2(args, function (x,y) { return x.toFixed(y) } , env, fcont)
                  }
                } else {
                  return function () {
                    return interpretBuiltin1(args, Math.round, env, fcont)
                  }
                }
            case 'range':
                return function () {
		  return interpretRange(args, keywords, env, fcont);
		}
	    case 'str':
                return function () {
		  return interpretStr(args, keywords, env, fcont);
		}
            case 'sum':
                if (args.length == 2) {
                  return function () {
                    return interpretExpression(args.get(0), env, async function(x,env2) {
                      return function () {
                        return interpretExpression(args.get(1), env2, async function(y,env3) {
                          pyodide.globals.set('arg1', x)
                          pyodide.globals.set('arg2', y)
                          let output = pyodide.runPython('sum(arg1,arg2)')
                          return function () { return fcont(output,env3) }
                        })
                      }
                    })
                  }
                } else {
                  return function () {
                    return interpretExpression(args.get(0), env, async function(x,env2) {
                         pyodide.globals.set('arg1', x)
                         let output = pyodide.runPython('sum(arg1)')
                         return function () { return fcont(output,env2) }
                     })
                  }
                }
	    default:
                env.error_cont(env, 'Oproep van onbekende functie: ' + id) 
	}  
    }  
}


async function interpretUserDefinedFunctionCall(id, args, keywords, env, fcont) {
    var scope = new Map() 
    var formal = env.funs.get(id)
    /* check if call has enough parameters */
    let args_length = args.length
    let defaults_length = formal.args.defaults.length
    let formals_length = formal.args.args.length
    if (args_length + defaults_length >= formals_length && args_length <= formals_length) {
        let defaults_needed = formals_length - args_length
        return function() {
          return evalArgs(0,args,0,formal.args.args,scope,env,async function(enva1) {
            return function () { 
              return evalArgs(defaults_length - defaults_needed,formal.args.defaults,args_length,formal.args.args,scope,enva1, async function(enva) {
                logMe(scope)
                enva.vars.unshift(scope)
                
                enva.globals.unshift(new Set())
                return_cont_old = env.return_cont
                return_cont_new = async function (x,env2a) {
                    env2a.vars.shift()
                    env2a.globals.shift()
                    env2b = {...env2a, return_cont: return_cont_old}
                    logMe("returning")
                    logMe(env2b)
                    return function () { return fcont(x,env2b) }
                }
                envb = {...enva, return_cont: return_cont_new}
                return function () {
                  return interpretBlock(formal.body, envb, async function(env3a) {
                    env3a.vars.shift()
                    env3a.globals.shift()
                    env3b = {...env3a, return_cont: return_cont_old}
                    return function () { return fcont(undefined,env3b) } // return from function without explicit invocation of return
                  })
               }
              })
            }
          })
        }
    } else {
        if (defaults_length > 0) {
          env.error_cont(env, 'Ongeldig aantal parameters voor \'' + id + '()\': ' + args_length + '; verwacht: ' + (formals_length - defaults_length)  + '-' + formals_length + '.') 
        } else {
          env.error_cont(env, 'Ongeldig aantal parameters voor \'' + id + '()\': ' + args_length + '; verwacht: ' + formals_length + '.') 
        }
    }
}


async function evalArgs(i,args,j,formal_args,map,env,cont) {
  if (i < args.length) {
    return function () { 
      return interpretExpression(args.get(i),env,async function (x,env2) {
        map.set(formal_args.get(j).arg, x)
        return function () { 
          return evalArgs(i+1,args,j+1,formal_args,map,env2,cont)
        }
      })
    }
  } else {
    return function () { return cont(env) }
  }
}


async function interpretSqrt(args, env, fcont) {
    return function () {
      return interpretBuiltin1(args, Math.sqrt, env, fcont)
    }
}

async function interpretMathCall(attr, args, env, fcont) {
  if (env.imports.has('math')) {
    switch (attr) {
      case 'fabs':
        return function () {
          return interpretBuiltin1(args, Math.abs, env, fcont)
        }
      case 'ceil':
        return function () {
          return interpretBuiltin1(args, Math.ceil, env, fcont)
        }
      case 'floor':
        return function () {
          return interpretBuiltin1(args, Math.floor, env, fcont)
        }
      case 'sqrt':
        return function () {
          return interpretSqrt(args, env, fcont)
        }
      case 'trunc':
        return function () {
          return interpretBuiltin1(args, Math.trunc, env, fcont)
        }
      case 'acos':
        return function () {
          return interpretBuiltin1(args, Math.acos, env, fcont)
        }
      case 'asin':
        return function () {
          return interpretBuiltin1(args, Math.asin, env, fcont)
        }
      case 'atan':
        return function () {
          return interpretBuiltin1(args, Math.atan, env, fcont)
        }
      case 'cos':
        return function () {
          return interpretBuiltin1(args, Math.cos, env, fcont)
        }
      case 'sin':
        return function () {
          return interpretBuiltin1(args, Math.sin, env, fcont)
        }
      case 'tan':
        return function () {
          return interpretBuiltin1(args, Math.tan, env, fcont)
        }
      case 'acosh':
        return function () {
          return interpretBuiltin1(args, Math.acosh, env, fcont)
        }
      case 'asinh':
        return function () {
          return interpretBuiltin1(args, Math.asinh, env, fcont)
        }
      case 'atanh':
        return function () {
          return interpretBuiltin1(args, Math.atanh, env, fcont)
        }
      case 'cosh':
        return function () {
          return interpretBuiltin1(args, Math.cosh, env, fcont)
        }
      case 'sinh':
        return function () {
          return interpretBuiltin1(args, Math.sinh, env, fcont)
        }
      case 'tanh':
        return function () {
          return interpretBuiltin1(args, Math.tanh, env, fcont)
        }
      case 'log':
        return function () {
          return interpretExpression(args.get(0), env, async function(x,env2) {
            return function () {
              return interpretExpression(args.get(1), env2, async function(y,env3) {
                return function () { 
                  return fcont(Math.log(x) / Math.log(y), env3)
                }
              })
            }
          })
        }
      default:
        env.error_cont(env, 'Oproep van niet-ondersteunde \'math\' functie: ' + attr) 
    }
  } else {
        env.error_cont(env, 'Het programma importeert de math module niet.')
  }
}

async function interpretCalendarCall(attr, args, env, fcont) {
  if (env.imports.has('calendar')) {
    switch (attr) {
      case 'prmonth':
        return function () {
          return interpretExpression(args.get(0), env, async function(x,env2) {
            return function () {
              return interpretExpression(args.get(1), env2, async function(y,env3) {
                pyodide.globals.set('arg1', x)
                pyodide.globals.set('arg2', y)
                var output = pyodide.runPython('import calendar\ncalendar.month(arg1,arg2)')
                await self.presentOutput(myToString(output)) // output already contains a newline
                return function () {
                  return fcont(undefined, env3)
                }
              })
            }
          })
        }
      case 'prcal':
        return function () {
          return interpretExpression(args.get(0), env, async function(x,env2) {
            pyodide.globals.set('arg1', x)
            var output = pyodide.runPython('import calendar\ncalendar.calendar(arg1)')
            await self.presentOutput(myToString(output)) // output already contains a newline
            return function () {
              return fcont(undefined, env2)
            }
          })
        }
      default:
        env.error_cont(env, 'Oproep van niet-ondersteunde \'calendar\' functie: ' + attr) 
    }
  } else {
        env.error_cont(env, 'Het programma importeert de calendar module niet.')
  }
}

async function interpretRandom(args, env, fcont) {
    var output = pyodide.runPython('import random\nrandom.random()')
    return function () { return fcont(output, env) }
}

async function interpretRandint(args, env, fcont) {
  return function () {
    return interpretExpression(args.get(0), env, async function(x,env2) {
      return function () {
        return interpretExpression(args.get(1), env2, async function(y,env3) {
          pyodide.globals.set('arg1', x)
          pyodide.globals.set('arg2', y)
          var output = pyodide.runPython('import random\nrandom.randint(arg1,arg2)')
          return function () {
            return fcont(output, env3)
          }
        })
      }
    })
  }
}

async function interpretChoice(args, env, fcont) {
  return function () {
    return interpretExpression(args.get(0), env, async function(x,env2) {
      pyodide.globals.set('arg1', x)
      var output = pyodide.runPython('import random\nrandom.choice(arg1)')
      return function () {
        return fcont(output, env2)
      }
    })
  }
}

async function interpretRandomCall(attr, args, env, fcont) {
  if (env.imports.has('random')) {
    switch (attr) {
      case 'random':
        return function () { return interpretRandom(args, env, fcont) }
      case 'randint':
        return function () { return interpretRandint(args, env, fcont) }
      case 'choice':
        return function () { return interpretChoice(args, env, fcont) }
      default:
        env.error_cont(env, 'Oproep van niet-ondersteunde \'random\' functie: ' + attr) 
    }
  } else {
        env.error_cont(env, 'Het programma importeert de random module niet.')
  }
}

async function interpretAttributeCall(value, attr, ctx, args, env, fcont) {
  if (value.__class__.__name__ === 'Name' && value.id === 'math') {
    return function () {
      return interpretMathCall(attr, args, env, fcont)
    }
  } else if  (value.__class__.__name__ === 'Name' && value.id === 'calendar') {
    return function () {
      return interpretCalendarCall(attr, args, env, fcont)
    }
  } else if  (value.__class__.__name__ === 'Name' && value.id === 'random') {
    return function () {
      return interpretRandomCall(attr, args, env, fcont)
    }
  } else if  (value.__class__.__name__ === 'Name' && value.id === 'date' && attr === 'today') {
    if (env.importfuns.has('date')) {
        var output = pyodide.runPython('from datetime import date\ndate.today()')
        logMe(output)
        return function () {
          return fcont(output, env) 
        }
    } else {
        env.error_cont(env, 'Het programma importeert date niet uit de datetime module.')
    }
  } else  if (value.__class__.__name__       === 'Attribute'  &&
              value.value.__class__.__name__ === 'Name'       &&
              value.value.id               === 'datetime'   &&
              value.attr                   === 'date'       &&
              attr                         === 'today'      &&
              true
             ) {
    if (env.imports.has('datetime')) {
      var output = pyodide.runPython('from datetime import date\ndate.today()')
      return function () {
        return fcont(output, env)
      }
    } else {
      env.error_cont(env, 'Het programma importeert de datetime module niet.')
    }
  } else {
    env.error_cont(env, 'Oproep van niet-ondersteunde functie: ' + value.__class__.__name__ + '.' + attr) 
  } 
}

async function interpretBuiltin1(args, f, env, fcont) {
  return function () {
    return interpretExpression(args.get(0), env, async function(x,env2) {
      return function () {
        return fcont(f(x),env2)
      }
    })
  }
}

async function interpretBuiltin2(args, f, env, fcont) {
  return function () {
    return interpretExpression(args.get(0), env, async function(x,env2) {
      return function () {
        return interpretExpression(args.get(1), env2, async function(y,env3) {
          return function () {
            return fcont(f(x,y),env3)
          }
        })
      }
    })
  }
}

async function interpretInt(args, keywords, env, fcont) {
    arg = args.get(0);
    return function () {
      return interpretExpression(arg, env, async function (x, env2) {
        value = Number(x.toString());
        if (isNaN(value)) {
          return function () {
            return fcont(undefined, env2)
          }
        } else {
          return function () {
            return fcont(Math.trunc(value), env2)
          }
        }
      })
    }
}

async function interpretFloat(args, keywords, env, fcont) {
    arg = args.get(0);
    return function () {
      return interpretExpression(arg, env, async function (x, env2) {
        value = Number(x.toString());
        if (isNaN(value)) {
          return function () {
            return fcont(undefined, env2)
          }
        } else {
          return function () {
            return fcont(value, env2)
          }
        }
      })
    }
}

async function interpretLen(args, keywords, env, fcont) {
    arg = args.get(0);
    return function () {
      return interpretExpression(arg, env, async function (x, env2) {
        return function () {
          return fcont(x.length, env2)
        }
      })
    }
}

async function interpretChr(args, keywords, env, fcont) {
    if (args.length == 1) {
        arg = args.get(0);
        return function () {
          return interpretExpression(arg, env, async function (x, env2) {
            pyodide.globals.set('arg1', x)
            var output = pyodide.runPython('chr(arg1)')
            return function () {
              return fcont(output, env2)
            }
          })
        }
    } else {
        env.error_cont(env, 'Ongeldig aantal parameters voor \'chr()\': ' + args.length + '; verwacht: 1.') 
    } 
}

async function interpretOrd(args, keywords, env, fcont) {
    if (args.length == 1) {
        arg = args.get(0);
        return function () {
          return interpretExpression(arg, env, async function (x, env2) {
            pyodide.globals.set('arg1', x)
            var output = pyodide.runPython('ord(arg1)')
            return function () {
              return fcont(output, env2)
            }
          })
        }
    } else {
        env.error_cont(env, 'Ongeldig aantal parameters voor \'ord()\': ' + args.length + '; verwacht: 1.')
    } 
}

async function interpretRange(args, keywords, env, fcont) {
    switch (args.length) {
      case 1:
        arg = args.get(0);
        return function () {
          return interpretExpression(arg, env, async function (x, env2) {
            pyodide.globals.set('arg1', x)
            var output = pyodide.runPython('range(arg1)')
            return function () {
              return fcont(output, env2)
            }
          })
        }
      case 2:
        arg1 = args.get(0);
        arg2 = args.get(1);
        return function () {
          return interpretExpression(arg1, env, async function (x, env2) {
            return function () {
              return interpretExpression(arg2, env2, async function (y, env3) {
                pyodide.globals.set('arg1', x)
                pyodide.globals.set('arg2', y)
                var output = pyodide.runPython('range(arg1,arg2)')
                return function () {
                  return fcont(output, env3)
                }
              })
            }
          })
        }
      case 3:
        arg1 = args.get(0);
        arg2 = args.get(1);
        arg3 = args.get(2);
        return function () {
          return interpretExpression(arg1, env, async function (x, env2) {
            return function () {
              return interpretExpression(arg2, env2, async function (y, env3) {
                return function () {
                  return interpretExpression(arg3, env3, async function (z, env4) {
                    pyodide.globals.set('arg1', x)
                    pyodide.globals.set('arg2', y)
                    pyodide.globals.set('arg3', z)
                    var output = pyodide.runPython('range(arg1,arg2,arg3)')
                    return function () {
                      return fcont(output, env4)
                    }
                  })
                }
              })
            }
          })
        }
      default:
        env.error_cont(env, 'Ongeldig aantal parameters voor \'range()\': ' + args.length + '; verwacht: 1, 2 of 3.') 
    } 
}

async function interpretStr(args, keywords, env, fcont) {
    arg = args.get(0);
    return function () {
      return interpretExpression(arg, env, async function (x, env2) {
        return function () {
          return fcont(myToString(x), env2)
        }
      })
    }
}

function myToString(value) {
    let result;
    if (value == undefined) {
        result = 'None'
    } else {
        try {
            pyodide.globals.set('arg1', value)
            result = pyodide.runPython('str(arg1)')
        } catch (err) {
            result = value.toString()
        }
    }
    return result;
}

async function interpretPrint(args, keywords, env, fcont) {
  return function () {
    return interpretPrintArgs(0, args, [], env, async function (list, env2) {
        return function () { 
          return interpretPrintKeywords(0, keywords, ' ', '\n', env2, async function (sep, end, env3) {
            txt = list.reduce(function (acc, elem) { return acc.concat(sep).concat(elem) }).concat(end);
            await self.presentOutput(txt);
            return function () { return fcont(undefined, env) }
            });
        }
    });
  }
}

async function interpretPrintArgs(i, args, acc, env, fcont) {
    logMe('interpretPrintArgs: ' + i)
    if (i < args.length) {
        let arg = args.get(i);
        return function () { 
          return interpretExpression(arg, env, async function (value, env2) {
            let str = myToString(value)
            acc.push(str);
            return function () { return interpretPrintArgs(i+1, args, acc, env2, fcont);     }
          });
        }
    } else {
        return function () { return fcont(acc, env) }
    }
}

async function interpretPrintKeywords(i, keywords, sep, end, env, fcont) {
    if (i < keywords.length) {
        arg = keywords.get(i).value;
        return function () {
          return interpretExpression(arg, env, async function (value, env2) {
            switch (keywords.get(i).arg) {
                case 'sep':
                    sep = value;
                    break;
                case 'end':
                    end = value;
                    break;
                default:
                    return env.error_cont(env, 'Niet-ondersteunde sleutelwoordparameter van \'print\': ' + keywords.get(i).arg) 
            }
            return function () {
              return interpretPrintKeywords(i+1, keywords, sep, end, env2, fcont)   
            }
          });
        }
    } else {
        return function () { return fcont(sep, end, env) }
    }
}

async function printRest(i, txt, args, keywords, env, fcont) {
    if (i < args.length) {
        arg = args.get(i);
        return function () {
          return interpretExpression(arg, env, async function (value, env2) {
            return function () {
              printRest(i+1, txt.concat(' ').concat(myToString(value)), args, keywords, env2, fcont)   
            }
          })
        }
    } else {
        await self.presentOutput(txt)
        return function () { return fcont(undefined, env) }
    }
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function interpretInput(args, keywords, env, fcont) {
    logMe('input')
    self.requestInput(env, 
      function (value, env1) {
        trampoline(function () {
          return fcont(value, env1)
        })
      }
    );
}

async function interpretConstant(value, env, fcont) {
  logMe(fcont)
  return function () { return fcont(value, env) }
}

async function interpretBinOp(left, op, right, env, fcont) {
  return function () {
    return interpretExpression(left, env, async function (x, env2) {
      return function () {
        return interpretExpression(right, env2, async function (y, env3) {
          return function () {
            return interpretOp(op, x, y, env3, fcont);
          }
        })
      }
    })	
  }
}

async function checkAdd(x, y, env, fcont) {
  if ((typeof(x) == 'number' && typeof(y) == 'number') ||
      (typeof(x) == 'string' && typeof(y) == 'string')) {
    return function () { return fcont(x + y, env) }
  } else {
    env.error_cont(env, "TypeError: niet ondersteunde parametertype(s) voor +: '" + typeof(x) + "' en '" + typeof(y) + "'")
  }
}

async function interpretOp(op, x, y, env, fcont) {
  logMe(op.__class__.__name__)
  switch (op.__class__.__name__) {
    case 'Add':
      return function () { return checkAdd(x, y, env, fcont) }
    case 'Sub':
      return function () { return fcont(x - y, env) }
    case 'Mult':
      return function () { return fcont(x * y, env) }
    case 'Div':
      return function () { return fcont(x / y, env) }
    case 'FloorDiv':
      return function () { return fcont(Math.floor(x / y), env) }
    case 'Mod':
      return function () { return fcont(((x % y ) + y ) % y, env) } /* turn Javascript remainder operator into Python modulo operator */
    case 'Pow':
      return function () { return fcont(x ** y, env) }
    case 'LShift':
      return function () { return fcont(x << y, env) }
    case 'RShift':
      return function () { return fcont(x >> y, env) }
    case 'BitOr':
      return function () { return fcont(x | y, env) }
    case 'BitXor':
      return function () { return fcont(x ^ y, env) }
    case 'BitAnd':
      return function () { return fcont(x & y, env) }
    default:
      env.error_cont(env, 'Niet-ondersteunde operator.') 
  }
}

async function interpretName(id, env, fcont) {
  logMe('interpretName:', env.vars)
  return function () { return interpretNameAux(0, id, env, fcont) }
}

async function interpretNameAux(i, id, env, fcont) {
  if (i < env.vars.length) {
    if (env.vars[i].has(id)) {
      return function () { return fcont(env.vars[i].get(id), env) }
    } else {
      return function () { return interpretNameAux(i+1, id, env, fcont) }
    }
  } else {
    env.error_cont(env, 'Onbekende variabele: ' + id) 
  }
}

async function interpretCompare(left, ops, comparators, env, fcont) {
  return function () {
    return interpretExpression(left, env, async function (x, env2) {
      return function () {
        return interpretExpression(comparators.get(0), env2, async function (y, env3) {
          return function () {
            return interpretCOp(ops.get(0), x, y, env3, fcont)
          }
        })
      }
    }) 
  }
}

async function interpretCOp(cop, x, y, env, fcont) {
  switch(cop.__class__.__name__) {
    case 'Eq':
      return function () { return fcont(x === y,env) }
    case 'NotEq':
      return function () { return fcont(x !== y,env) }
    case 'Lt':
      return function () { return fcont(x < y,env) }
    case 'LtE':
      return function () { return fcont(x <= y,env) }
    case 'Gt':
      return function () { return fcont(x > y,env) }
    case 'GtE':
      return function () { return fcont(x >= y,env) }
    default:
      env.error_cont(env, 'Niet-ondersteunde vergelijkingsoperator.') 
//    case 'Is':
//      break;
//    case 'IsNot':
//      break;
//    case 'In':
//      break;
//    case 'NotIn':
//      break;
  }
}

async function interpretBoolOp(op, values, env, fcont) {
  switch (op.__class__.__name__) {
    case 'And':
      return function () { return interpretAnd(0, values, true, env, fcont) }
    case 'Or':
      return function () { return interpretOr(0, values, false, env, fcont) }
  }
}
 
async function interpretAnd(i, values, acc, env, fcont) {
  if (acc && i < values.length) {
    return function () { 
      return interpretExpression(values.get(i), env, async function (x, env2) {
        return function () { 
          return interpretAnd(i+1,values,x,env2,fcont) 
        }
      })
    }
  } else {
    return function () { return fcont(acc, env) }
  }
}

async function interpretOr(i, values, acc, env, fcont) {
  if (acc || i >= values.length) {
    return function () { return fcont(acc, env) } 
  } else {
    return function () {
      return interpretExpression(values.get(i), env, async function (x, env2) {
        return function () { return interpretOr(i+1,values,x,env2,fcont) }
      })
    }
  }
}

async function interpretUnaryOp(op, operand, env, fcont) {
  switch (op.__class__.__name__) {
    case 'USub':
      return function () {
        return interpretExpression(operand, env, async function(x,env2) {
          return function () { return fcont(-x, env2) }
        })
      }
    case 'UAdd':
      return function () {
        return interpretExpression(operand, env, async function(x,env2) {
          return function () { return fcont(+x, env2) }
        })
      }
    case 'Not':
      return function () {
        return interpretExpression(operand, env, async function(x,env2) {
          return function () { return fcont(!x, env2) }
        })
      }
    default:
      env.error_cont(env, 'Niet-ondersteunde unaire operator.') 
  }
}

async function interpretArgs(i, args, acc, env, fcont) {
    if (i < args.length) {
        arg = args.get(i);
        return function () {
          return interpretExpression(arg, env, async function (value, env2) {
            acc.push(value);
            return function () {
              return interpretArgs(i+1, args, acc, env2, fcont);    
            }
          });
        }
    } else {
        return function () { return fcont(acc, env) }
    }
}

async function interpretList(elts, ctx, env, fcont) {
  return function () {
    return interpretArgs(0, elts, [], env, async function (list, env2) {
        pyodide.globals.set('arg1', list)
        var output = pyodide.runPython('list(arg1)')
        return function () { return fcont(output,env2) }
    })
  }
}

async function interpretTuple(elts, ctx, env, fcont) {
  return function () {
    return interpretArgs(0, elts, [], env, async function (list, env2) {
        logMe("creating tuple")
        pyodide.globals.set('arg1', list)
        var output = pyodide.runPython('tuple(arg1)')
        return function () { return fcont(output, env2) }
    });
  }
}
