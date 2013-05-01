/*
 * jQuery UIx FilterBuilder
 *
 * Authors:
 *  Yanick Rochon (yanick.rochon[at]gmail[dot]com)
 *
 * Licensed under the MIT (MIT-LICENSE.txt) license.
 *
 * Depends:
 * jQuery UI 1.9+
 *
 */

(function( $, undefined ) {

    var PARAM_REGEX = new RegExp("@(\\d+)", 'gi');
	var EXPRESSION_REGEX = new RegExp("\\{:([^/}]+)(/(\d+))?\\}", 'gi');

	var EXPRESSION_OPERATOR_PREFIX = "expr.";
	var FIELD_OPERATOR_PREFIX = "field.";


	var FILTER_SKELETON = '<table class="expr-clause"><tbody><tr>' +
			'<td><div class="expr-select"></div></td>' +
			'<td class="ui-widget-content ui-corner-left" style="width: 8px; border-right:none;"></td> ' +
			'<td><div class="expr-conditions"></div><div class="expr-new-condition"></div></td>' +
		'</tr></tbody></table>';
	var CLAUSE_SKELETON = '<table class="expr-condition"><tbody><tr>' +
			'<td><div class="expr-field"></div></td><td><div class="expr-operator"></div></td><td><div class="expr-params"></div></td>' +
		'</tr></tbody></table>';


	$.widget("uix.filterbuilder", {
		options: {
			// options
			fields: [],                           // an array of available fields (string)
			defaultFieldOperator: "field.equal",  // when creating a new clause, use this operator (should start with "field.")
			fieldEncloseStart: "",                // enclose field names; start string
			fieldEncloseEnd: "",                  // enclose field names; end string
			subClauseEncloseStart: "(",           // enclose sub clause; start string
			subClauseEncloseEnd: ")",             // enclose sub clause; start string
			operators: {                          // all the available operators for the filter builder
				// NOTE : operators may be referenced by other operators. Ex:
				//        "@1 {:oper.eq} @2"                     resolves to "@1 == @2"
				//        "{:expr.match.none/1} {:oper.neq} @2"  resolves to "!(@1) != @2" 
				//        Resolution is performed recursively, there is no other substitution.

				// general operators
				"oper.ieq": "===",
				"oper.ineq": "!==",
				"oper.eq": "==",
				"oper.neq": "!=",
				"oper.lt": "<",
				"oper.lte": "<=",
				"oper.gt": ">",
				"oper.gte": ">=",
				"oper.and": "&&",
				"oper.or": "||",

				// expression clause grouping operator, where @1 and @2 are left and write clauses
				// if an array, first element is grouping left and right, second element wraps the entire clause
				"expr.match.all": "@1 {:oper.and} @2",
				"expr.match.any": "@1 {:oper.or} @2",
				"expr.match.none": ["@1 {:oper.or} @2", "!(@1)"],

				// field operators, where @1 is the field and @2, @3 are the field params
				"field.equal.field": "@1 {:oper.ieq} @2",
				"field.equal": "@1 {:oper.ieq} @2",
				"field.not.equal": "@1 {:oper.ineq} @2",
				"field.match": "@1 {:oper.eq} @2",
				"field.not.match": "@1 {:oper.neq} @2",
				"field.null": "@1 {:oper.ieq} null {:oper.or} @1 {:oper.ieq} undefined",
				"field.not.null": "@1 {:oper.ineq} null {:oper.or} @1 {:oper.ineq} undefined",
				"field.between": "(@1 {:oper.gt} @2 {:oper.and} @1 {:oper.lt} @3)",
				"field.between.inc": "(@1 {:oper.gte} @2 {:oper.and} @1 {:oper.lte} @3)",
				"field.contain": "@1.indexOf(@2) {:oper.gte} -1",
				"field.not.contain": "@1.indexOf(@2) {:oper.ieq} -1",
				"field.start.with": "@1.indexOf(@2) {:oper.gte} 0",
				"field.not.start.with": "@1.indexOf(@2) {:oper.ineq} 0",
				"field.end.with": "@1.indexOf(@2) {:oper.ieq} (@1.length - @2.length)",
				"field.not.end.with": "@1.indexOf(@2) {:oper.ineq} (@1.length - @2.length)",
				"field.less.than": "@1 {:oper.lt} @2",
				"field.less.than.equal": "@1 {:oper.lte} @2",
				"field.greater.than": "@1 {:oper.gt} @2",
				"field.greater.than.equal": "@1 {:oper.gte} @2"
			},

			// events
			create: null,             // event triggered when the widget has been created
			clauseAdded: null,        // event triggered when a new clause is added; ui receives the clause element container created
			clauseRemoved: null,      // event triggered when a clause is removed; ui receives the detached clause element
			clauseParamsChange: null, // event triggered when a clause operator has changed, thus changing the params
			change: null              // event triggered when the filter builder has changed
		},

		_create: function () {
			this._initFilter(this.element);


			this._trigger("create");
		},

		_setOption: function (key, value) {
			// TODO : implement this
		},

		//_refresh: function () {
			// TODO : destroy and rebuild the whole tree ???
		//},

		_destroy: function () {
			this._trigger("clauseRemoved", null, {
				subClause: this.element
			});

			this.element.empty();  // cleanup everything
		},




		_initFilter: function(element) {
			return $(FILTER_SKELETON)
				.find(".expr-select").append(this._clauseOperatorsSelect(EXPRESSION_OPERATOR_PREFIX)).end()
				.find(".expr-conditions").append(this._clauseCondition(null /* default */)).end()
				.find(".expr-new-condition").append(this._clauseAddCondition()).end()
				.appendTo(element)
			;
		},

		
		_clauseOperatorsSelect: function(prefix) {
			var select = $("<select>");
			var self = this;

			$.each(self.options.operators, function (oper, expression) {
				if (oper.indexOf(prefix) === 0) {
					select.append($("<option>").prop("selected", oper === self.options.defaultFieldOperator).val(oper).text(t[oper]));
				}
			});
		
			return select.on("change", function (e) {
				// TODO : add UI object context... ?
				self._trigger("change");
			});
		},

		_clauseCondition: function(operator) {
			var self = this;
			return $(CLAUSE_SKELETON)
				.find(".expr-field")
					.append($('<a href="#remove" role="button">').text(t["btn.remove"]).on("click", function(e) {
						var count = $(this).closest(".expr-conditions").find(".expr-condition").length;
						var currentClause = $(this).closest(".sub-clause");

						if (count > 1) {
							self._trigger("clauseRemoved", e, {
								clause: (currentClause = $(this).closest(".expr-condition").detach())
							});
						} else if (currentClause.length) {
						
							var subClause = currentClause.find(".sub-clause").filter(function(e) {
								return $(this).parentsUntil(currentClause, ".sub-clause").length === 0;
							}).detach();

							if (subClause.length) {
								currentClause.before(subClause).detach();
							} else {
								currentClause.detach();
							}

							self._trigger("clauseRemoved", e, {
								subClause: currentClause
							});
						}

						currentClause.remove(); // cleanup

						return e.preventDefault(), e.stopPropagation(), false;
					}))
					.append(r.fieldName(self, "@1")).end()
				.find(".expr-operator").append(self._clauseOperatorsSelect(FIELD_OPERATOR_PREFIX).on("change", function (e) {
					var oldParams = $(this).closest(".expr-condition").find(".expr-params").children();
					var newParams = self._clauseParams($(this).val());

					// transfer old -> new params
					newParams.find(":data(param-name)").each(function (i, nel) {
						var param = $(nel).data("param-name");
						oldParams.find(":data(param-name)").each(function (i, oel) {
							if ($(oel).data("param-name") === param) {
								$(nel).val($(oel).val());
								return false;
							}
						});
					});

					oldParams.replaceWith(newParams);

					self._trigger("clauseParamsChange", e, {
						oldParams: oldParams,
						newParams: newParams
					});
				})).end()
				.find(".expr-params").append(self._clauseParams()).end();
			;
		},

		_clauseParams: function (operator) {
			return $("<div>").append(cParams[operator || this.options.defaultFieldOperator].render.call(this));
		},

		_clauseAddCondition: function () {
			var self = this;
			return $("<div>")
				.append($('<a href="#add" role="button">').text(t["btn.add"]).on("click", function (e) {
					var currentClause = self._clauseCondition();

					$(this).closest(".expr-new-condition").siblings(".expr-conditions").append(currentClause);

					self._trigger("clauseAdded", e, { clause: currentClause });

					return e.preventDefault(), e.stopPropagation(), false;
				}))
				.append($('<a href="#add-sub" role="button">').text(t["btn.add.sub"]).on("click", function (e) {
					var subFilter = $("<div>").addClass("sub-clause");
					self._initFilter(subFilter);
					$(this).closest(".expr-new-condition").before(subFilter);

					self._trigger("clauseAdded", e, { subClause: subFilter });

					return e.preventDefault(), e.stopPropagation(), false;
				}))
			;
		},

		compile: function () {
			return _compile(this.element, this);
		}

	});


	function _compile(element, ctx) {
		var self = this;
		var left = null;
		var fieldStart = ctx.options.fieldEncloseStart;
		var fieldEnd = ctx.options.fieldEncloseEnd;
		var subClauseStart = ctx.options.subClauseEncloseStart;
		var subClauseEnd = ctx.options.subClauseEncloseEnd;

		element.find("table.expr-clause").filter(function (e) {
			return $(this).parentsUntil(element, "table.expr-clause").length === 0;
		}).each(function (i, subClause) {
			var glue = $(subClause).find(".expr-select select").val();
			var right;

			$(subClause).find(".expr-conditions").filter(function(e) {
				return $(this).parentsUntil(subClause, "table.expr-clause").length === 0;
			}).find(".expr-condition").each(function (i, clause) {
				var operator = $(clause).find(".expr-operator select").val();
				var values = [fieldStart + $(clause).find(".expr-field input").val() + fieldEnd];
				$(clause).find(".expr-params").each(function (i, params) {
					values = values.concat(cParams[operator].getValues.call(ctx, $(params)));
				});

				right = formatExpression(operator, ctx.options.operators, values);

				if (left) {
					left = formatExpression(glue, ctx.options.operators, [left, right]);
				} else {
					left = right;
				}
			});

			right = _compile($(subClause), ctx);
			if (right) {
				if (left) {
					left = formatExpression(glue, ctx.options.operators, [left, subClauseStart + right + subClauseEnd]);
				} else {
					left = right;
				}
			}

			// wrap if necessary
			right = formatExpression(glue, ctx.options.operators, [left], 1);
			if (right) {
				left = right;
			}
		});

		return left;
	};

	function formatExpression(key, operators, values, keyIndex) {
		values = values || [];
		return (function _expr(key, keyIndex) {
			var operatorExpr = "";

			if (operators[key]) {
				operatorExpr = operators[key];

				if ($.isArray(operatorExpr)) {
					operatorExpr = operatorExpr[keyIndex || 0];
				} else if (keyIndex > 0) {
					return "";
				}
			} else {
				return "";
			}

			return operatorExpr.replace(EXPRESSION_REGEX, function (g, e) {
				return _expr(e);
			});
		})(key, keyIndex).replace(PARAM_REGEX, function (g, p) {
			return p <= values.length ? values[p - 1] : "false";
		});
	};


	function quoteParam(value) {
		if (isNaN(parseFloat(value))) {
			value = '"' + value + '"';
		}
		return value;
	};

	function clauseNoParam() {
		return {
			render: function () { return $("<span>"); },
			getValues: $.noop
		};
	};
	function clauseSingleTextParam() {
		return {
			render: function () {
				return r.fieldValue(this, "@2");
			},
			getValues: function (element) {
				return [quoteParam(element.find("input[type='text']").val())];
			}
		};
	};
	function clauseDoubleTextParams(values) {
		return {
			render: function () {
				return r.fieldValue(this, "@2").add(r.fieldValue(this, "@3"));
			},
			getValues: function (params) {
				var res = [];
				$.each(params.find("input[type='text']"), function (i, input) {
					res.push(quoteParam($(input).val()));
				});
				
				return res;
			}
		};
	};


	var r = $.uix.filterbuilder.renderers = {
		fieldName: function (ctx, paramName, value) {
			return $('<input type="text" />')
				.attr("name", "fields[]")
				.attr("aria-autocomplete", "inline")
				.data("param-name", paramName || "@1").val(value || "")
				.on("change", function (e) {
					// TODO : add UI object context... ?
					ctx._trigger("change");
				})
			;
		},
		fieldValue: function (ctx, paramName, value) {
			return $('<input type="text" />')
				.attr("name", "values[]")
				.attr("aria-autocomplete", "inline")
				.data("param-name", paramName).val(value || "")
				.on("change", function () {
					// TODO : add UI object context... ?
					ctx._trigger("change");
				})
			;
		}
	};

	var t = $.uix.filterbuilder.i18n = {
		"expr.match.all": "Match All",
		"expr.match.any": "Match Any",
		"expr.match.none": "Match.none",
		
		"field.equal.field": "equal field",
		"field.equal": "equals",
		"field.not.equal": "not equals",
		"field.match": "matches",
		"field.not.match": "differs from",
		"field.null": "is null",
		"field.not.null": "is not null",
		"field.between": "between (exclusive)",
		"field.between.inc": "between (inclusive)",
		"field.contain": "contains",
		"field.not.contain": "does not contain",
		"field.start.with": "starts with",
		"field.not.start.with": "does not start with",
		"field.end.with": "ends with",
		"field.not.end.with": "does not end with",
		"field.less.than": "less than",
		"field.less.than.equal": "less than or equal to",
		"field.greater.than": "greater than",
		"field.greater.than.equal": "greater than or equal to",

		"btn.add": "Add",
		"btn.add.sub": "Add Sub",
		"btn.remove": "Remove"

	};

	var cParams = $.uix.filterbuilder.clauseParams = {
		"field.equal.field": {
			render: function () {
				return r.fieldName(this, "@2");
			},
			getValues: function (element) {
				return [this.options.fieldEncloseStart + element.find("input[type='text']").val() + this.options.fieldEncloseEnd];
			}
		},
		"field.equal": clauseSingleTextParam(),
		"field.not.equal": clauseSingleTextParam(),
		"field.match": clauseSingleTextParam(),
		"field.not.match": clauseSingleTextParam(),
		"field.null": clauseNoParam(),
		"field.not.null": clauseNoParam(),
		"field.between": clauseDoubleTextParams(),
		"field.between.inc": clauseDoubleTextParams(),
		"field.contain": clauseSingleTextParam(),
		"field.not.contain": clauseSingleTextParam(),
		"field.start.with": clauseSingleTextParam(),
		"field.not.start.with": clauseSingleTextParam(),
		"field.end.with": clauseSingleTextParam(),
		"field.not.end.with": clauseSingleTextParam(),
		"field.less.than": clauseSingleTextParam(),
		"field.less.than.equal": clauseSingleTextParam(),
		"field.greater.than": clauseSingleTextParam(),
		"field.greater.than.equal": clauseSingleTextParam()
	};

})(jQuery);
