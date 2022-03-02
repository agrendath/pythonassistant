import re


def filter_error_messages(pylint_output: str) -> str:

    out = ""
    pattern = r".*: (\w+): (.*)"

    for line in pylint_output:
        if line[0] == "*":
            continue
        elif line[0] == "-":
            break

        match = re.search(pattern, line)
        error_code = match.group(1)

        if error_code[0] == "E":  # we are currently only interested in E error messages
            out += line

    return out


def translate(error_code: str, msg: str) -> str:

    msg = msg.upper()

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
            return msg
