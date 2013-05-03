/*
 * jQuery UIx FilterBuilder
 *
 * Authors:
 *  Yanick Rochon (yanick.rochon[at]gmail[dot]com)
 *
 * Dual licensed under the MIT (MIT-LICENSE.txt)
 * and GPL (GPL-LICENSE.txt) licenses.
 *
 *
 * Filter ruiles : JS
 *
 */

(function ($) {

    var FIELD_ESCAPE_START = "";
    var FIELD_ESCAPE_END = "";
    var STRING_ESCAPE_START = "\"";
    var STRING_ESCAPE_END = "\"";

    function quoteField(value) {
        return FIELD_ESCAPE_START + value + FIELD_ESCAPE_END;
    };
    function quoteValue(value) {
        if (isNaN(parseFloat(value))) {
            value = STRING_ESCAPE_START + value + STRING_ESCAPE_END;
        }
        return value;
    };

    var rules = $.uix.filterbuilder.rules['js'] = {
        //features: {  // not implemented
        //    subClauses: true,           // are subclauses allowed?
        //    subClauseMaxDepth: 0,       // maximum depth of sub clauses
        //    clauseConditionCount: 0,    // maximum number of conditions per clause
        //},
        defaultClauseWrap: "(@1)",
        defaultClauseExpression: "expr.match.any",
        defaultFieldExpression: "expr.equal",

        // NOTE : operators may be referenced by expression patterns. Ex:
		//        "@1 {:eq} @2"                     resolves to "@1 == @2"
		//        "{:not}@1 {:neq} @2"  resolves to "!@1 != @2"
        operators: {
			"ieq": "===",
			"ineq": "!==",
			"eq": "==",
			"neq": "!=",
			"lt": "<",
			"lte": "<=",
			"gt": ">",
			"gte": ">=",
			"and": "&&",
			"or": "||",
            "not": "!"
        },

        clauseExpressions: {
			// expression clause grouping operator, where @1 and @2 are left and write clauses
			// if an array, first element is grouping left and right, second element wraps the entire clause
			"expr.match.all": { pattern: "@1 {:and} @2" },
			"expr.match.any": { pattern: "@1 {:or} @2" },
			"expr.match.none": { pattern: "@1 {:or} @2", wrap: "{:not}(@1)" },
        },

        fieldExpressions: {
			// field operators, where @1 is the field and @2, @3 are the field params
			"expr.equal": { pattern: "@1 {:ieq} @2", params: { "@1": "field", "@2": "any" } },
			"expr.not.equal": { pattern: "@1 {:ineq} @2", params: { "@1": "field", "@2": "any" } },
			"expr.match": { pattern: "@1 {:eq} @2", params: { "@1": "field", "@2": "any" } },
			"expr.not.match": { pattern: "@1 {:neq} @2", params: { "@1": "field", "@2": "any" } },
			"expr.null": { pattern: "@1 {:ieq} null {:or} @1 {:ieq} undefined", params: { "@1": "field" } },
			"expr.not.null": { pattern: "@1 {:ineq} null {:or} @1 {:ineq} undefined", params: { "@1": "field" } },
			"expr.between": { pattern: "(@1 {:gt} @2 {:and} @1 {:lt} @3)", params: { "@1": "field", "@2": "any", "@3": "any" } },
			"expr.between.inc": { pattern: "(@1 {:gte} @2 {:and} @1 {:lte} @3)", params: { "@1": "field", "@2": "any", "@3": "any" } },
			"expr.contain": { pattern: "@1.indexOf(@2) {:gte} -1", params: { "@1": "field", "@2": "any" } },
			"expr.not.contain": { pattern: "@1.indexOf(@2) {:ieq} -1", params: { "@1": "field", "@2": "any" } },
			"expr.start.with": { pattern: "@1.indexOf(@2) {:gte} 0", params: { "@1": "field", "@2": "any" } },
			"expr.not.start.with": { pattern: "@1.indexOf(@2) {:ineq} 0", params: { "@1": "field", "@2": "any" } },
			"expr.end.with": { pattern: "@1.indexOf(@2) {:ieq} ((''+@1).length - (''+@2).length)", params: { "@1": "field", "@2": "any" } },
			"expr.not.end.with": { pattern: "@1.indexOf(@2) {:ineq} ((''+@1).length - (''+@2).length)", params: { "@1": "field", "@2": "any" } },
			"expr.less.than": { pattern: "@1 {:lt} @2", params: { "@1": "field", "@2": "any" } },
			"expr.less.than.equal": { pattern: "@1 {:lte} @2", params: { "@1": "field", "@2": "any" } },
			"expr.greater.than": { pattern: "@1 {:gt} @2", params: { "@1": "field", "@2": "any" } },
			"expr.greater.than.equal": { pattern: "@1 {:gte} @2", params: { "@1": "field", "@2": "any" } }
        },

        paramHandlers: {
            "field": {
                render: function(value) {
                    return $("<input>").prop("type", "text").val(value || "").autocomplete({
                        source: this.options.fields
                    });
                },
                format: function(element) {
                    return [quoteField(element.val() || "")];
                },
                serialize: function(element) {
                    return element.data("param-name") + "=" + (element.val() || "");
                },
                deserialize: function(data) {
                    var parts = data.split("=");
                    return rules.paramHandlers["field"].render.call(this).attr("data-param-name", parts[0]).val(parts[1] || "");
                }
            },
            "any": {
                render: function(value) {
                    var parts = (value || "").split("/");
                    var check = $("<input>").prop("type", "checkbox").prop("checked", !!parseInt(parts[0])).uniqueId();
                    var label = $("<label>").prop("for", check.prop("id")).text(this._t("param.check.field")).val(parts.slice(1).join("/") || "");
                    return check.add(label).add($("<input>").prop("type", "text").autocomplete({
                        source: this.options.fields
                    }));
                },
                format: function(element) {
                    var checked = element.filter("input:checkbox").is(":checked");
                    var val = element.filter("input[type='text']").val() || "";
                    if (checked) {
                        val = quoteField(val);
                    } else {
                        val = quoteValue(val);
                    }
                    return [val];
                },
                serialize: function(element) {
                    var checked = element.filter("input:checkbox").is(":checked");
                    var val = element.filter("input[type='text']").val() || "";
                    return element.data("param-name") + "=" + (checked ? 1 : 0) + "/" + val;
                },
                deserialize: function(data) {
                    var parts = data.split("=");
                    var vals = (parts[1] || "").split("/");
                    return rules.paramHandlers["any"].render.call(this)
                        .filter("input[type='checkbox']").prop("checked", !!parseInt(vals[0])).end()
                        .filter("input[type='text']").val(vals[1] || "").end();
                }
            }
        }

    };

})(jQuery);
