ecmarkup
========

A web component-based source format for ECMAScript and related specifications. An example of ECMAScript represented in this format can be found at [bterlson/ecmascript](http://github.com/bterlson/ecmascript).

### Entity Summary

 Entity | Element   | Short-hand | Description            
--------|-----------|------------|------------------------
Clause  | es-clause |            | Clauses and subclauses. Contains normative content.
Introduction | es-intro |        | Introductory content. Contains non-normative content.
Annex | es-annex | | Annex content. Normativity depends on presence of normative attribute.
Note | es-note | | Non-normative explanatory content.
Cross-reference | es-xref | | References a clause or production by anchor. NOTE: May be removed in favor of vanilla anchors.
Production | es-production | | A production of the grammar (ie. a LHS). The LHS is always a non-terminal.
Production RHS | es-rhs | | RHS of a production
Grammar terminal | es-t | | Terminal symbol
Grammar non-terminal | es-nt| | Non-terminal
Grammar annotation | es-gann | | An annotation, contains such things as RHS parameters and No LineTerminator Here.
Grammar prose | es-gprose | | Some explanatory prose in the grammar (eg. "Any Unicode code point")

The following elements need not be used directly as the elements above use these implicitly depending on attributes. For example, by adding the oneOf attribute to an es-production, the es-oneof element is appended. This is useful for styling purposes and as targets for static build tools.

 Entity | Element   | Description            
--------|-----------|------------------------
Grammar type | es-geq | Contains the colons that appear to the right of an LHS. Created by es-production depending on the value of the type attribute.
Grammar constrants | es-constraints | Constraints for an RHS. Created by es-rhs depending on the value of the constraints attribute.
Oneof production | es-oneof | Contains the text "one of" for es-productions with the oneof attribute
LHS and non-terminal modifiers | es-mods | Such things as parameters and optionality. Created by es-production and es-nt depending on the value of the params and optional attribute.
         
