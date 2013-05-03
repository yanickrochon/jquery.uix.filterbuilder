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

    var PARAM_REGEX = new RegExp("(@\\d+)", 'gi');
	var EXPRESSION_REGEX = new RegExp("\\{:([^}]+)\\}", 'gi');


	var FILTER_SKELETON = '<table class="expr-clause"><tbody><tr>' +
			'<td><div class="expr-select"></div></td>' +
			'<td class="ui-widget-content ui-corner-all"><div class="expr-conditions"></div><div class="expr-new-condition"></div></td>' +
		'</tr></tbody></table>';
	var CLAUSE_SKELETON = '<table class="expr-condition"><tbody><tr>' +
			'<td><div class="expr-controls"></div></td><td><div class="expr-field"></div></td><td><div class="expr-operator"></div></td><td><div class="expr-params"></div></td>' +
		'</tr></tbody></table>';


	$.widget("uix.filterbuilder", {
		options: {
			// options
			fields: [],               // an array of available fields (string)
			locale: 'auto',           // the widget's locale
            rule: 'js',               // the filter rules to apply

			// events
			create: null,             // event triggered when the widget has been created
			clauseAdded: null,        // event triggered when a new clause is added; ui receives the clause element container created
			clauseRemoved: null,      // event triggerformatExpressioned when a clause is removed; ui receives the detached clause element
			clauseParamsChange: null, // event triggered when a clause operator has changed, thus changing the params
			change: null              // event triggered when the filter builder has changed
		},

		_create: function () {
			this._setLocale();
            this._setRule();
			this._createClause().appendTo(this.element);


			this._trigger("create");
		},

		_setOption: function (key, value) {
			if (key === "locale") {
				this._setLocale(value);
			} else if (key === "rule") {
                this._setRule(value);
            }

			this._delay("refresh");
		},

		_refresh: function () {
			this.deserialize( this.serialize() );
		},

		_destroy: function () {
			this._trigger("clauseRemoved", null, {
				subClause: this.element
			});

			this.element.empty();  // cleanup everything
		},

		_setLocale: function (locale) {
            var t;

			locale = locale || this.options.locale || 'auto';

			if (locale == 'auto') {
				locale = navigator.userLanguage ||
                         navigator.language ||
                         navigator.browserLanguage ||
                         navigator.systemLanguage ||
                         '';
			}
			if (!$.uix.filterbuilder.i18n[locale]) {
				locale = '';   // revert to default is not supported auto locale
			}
			this.options.locale = locale;
            t = $.uix.filterbuilder.i18n[locale];
			this._t = function(key) {
                return t[key] || key;
            };
		},

        _setRule: function(rule) {
            rule = rule || this.options.rule;

            if (!$.uix.filterbuilder.rules[rule]) {
                throw ("Specified rule not found : " + rule);
            }

            this.options.rule = rule;
            this._r = $.uix.filterbuilder.rules[rule];
        },

		_createClause: function(operator) {
			return $(FILTER_SKELETON)
				.find(".expr-select").append(this._clauseOperatorsSelect(true, operator)).end()
				.find(".expr-conditions").append(this._clauseCondition(null /* default */)).end()
				.find(".expr-new-condition").append(this._clauseAddCondition()).end()
			;
		},


		_clauseOperatorsSelect: function(clauseExpressions, operator) {
			var select = $("<select>");
			var self = this;
            var defOperKey = "default" + (clauseExpressions ? "Clause" : "Field") + "Expression";

            operator = operator || this._r[defOperKey];

			$.each(this._r[(clauseExpressions ? "clause" : "field") + "Expressions"], function (oper, expression) {
				select.append($("<option>")
					.prop("selected", oper === operator)
					.val(oper)
					.text(self._t(oper)));
			});

			return select.on("change", function (e) {
				// TODO : add UI object context... ?
				self._trigger("change");
			});
		},

		_clauseCondition: function(operator, field, params) {
			var self = this;

            operator = operator || this._r.defaultFieldExpression;

			return $(CLAUSE_SKELETON)
				.find(".expr-controls")
					.append($('<a href="#remove" role="button">').text(self._t("btn.remove")).on("click", function(e) {
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
					})).end()
				.find(".expr-field").append( self._clauseParams(true, operator, field) ).end()
				.find(".expr-operator").append(self._clauseOperatorsSelect(false, operator).on("change", function (e) {
                    var params = $(this).closest(".expr-condition").find(".expr-params");
					var oldParams = params.children();
					var newParams = self._clauseParams(false, $(this).val());

					// transfer old -> new params
					newParams.filter("[data-param-name]").each(function (i, nel) {
						oldParams.filter("[data-param-name]").each(function (i, oel) {
							if (($(oel).data("param-name") === $(nel).data("param-name")) && ($(oel).prop("nodeName") === $(nel).prop("nodeName"))) {
								$(nel).val($(oel).val());
                                if ($(oel).is(":checked")) {
                                    $(nel).prop("checked", true);
                                }
							}
						});
					});

					self._trigger("clauseParamsChange", e, {
						oldParams: oldParams,
						newParams: newParams
					});

					params.empty().append(newParams);

				})).end()
				.find(".expr-params").append( self._clauseParams(false, operator, params) ).end();
			;
		},

		_clauseParams: function (fieldParam, operator, serializedValue) {
            var self = this;
            var expr = this._r.fieldExpressions[operator];
            var params = $();

            $.each(expr.params, function(name, renderer) {
                if ((name === "@1" && fieldParam) || (name !== "@1" && !fieldParam)) {
                    var value = serializedValue && serializedValue.shift() || false;

                    params = params.add( self._r.paramHandlers[renderer][value ? "deserialize" : "render"].call(self, value).attr("data-param-name", name)
                        .on("change", function(e) {	self._trigger("change", e); }) );
                }
            });

			return params;
		},

		_clauseAddCondition: function () {
			var self = this;
			return $("<div>")
				.append($('<a href="#add" role="button">').text(self._t("btn.add")).on("click", function (e) {
					var currentClause = self._clauseCondition();

					$(this).closest(".expr-new-condition").siblings(".expr-conditions").append(currentClause);

					self._trigger("clauseAdded", e, { clause: currentClause });

					return e.preventDefault(), e.stopPropagation(), false;
				}))
				.append($('<a href="#add-sub" role="button">').text(self._t("btn.add.sub")).on("click", function (e) {
					var subFilter = $("<div>").addClass("sub-clause");
					self._createClause().appendTo(subFilter);
					$(this).closest(".expr-new-condition").before(subFilter);

					self._trigger("clauseAdded", e, { subClause: subFilter });

					return e.preventDefault(), e.stopPropagation(), false;
				}))
			;
		},

		compile: function () {
			return _compile(this.element, this);
		},

        serialize: function() {
            return _serialize(this.element, this);
        },

        deserialize: function(data) {
            this.element.empty().append( _deserialize(data, this) );
        }

	});

    function _serialize(element, self) {
		var stack = [];

		element.find("table.expr-clause").filter(function (e) {
			return $(this).parentsUntil(element, ".sub-clause").length === 0;
		}).each(function (i, clause) {
			var glue = $(clause).find(".expr-select:first select").val();

            $(clause).find(".sub-clause").filter(function(e) {
                return $(this).parentsUntil(clause, "table.expr-clause").length === 0;
            }).each(function(i, subClause) {
    			//stack = stack.concat(_serialize($(subClause), self));
                stack.push(_serialize($(subClause), self));
            });

			$(clause).find(".expr-conditions").filter(function(e) {
				return $(this).parentsUntil(clause, "table.expr-clause").length === 0;
			}).find(".expr-condition").each(function (i, condition) {
				var operator = $(condition).find(".expr-operator:first select").val();
                var expr = self._r.fieldExpressions[operator];

                $.each(expr.params, function(name, renderer) {
                    var value = self._r.paramHandlers[renderer].serialize.call(self, $(condition).find("[data-param-name='" + name + "']"));
                    stack.push(value);
                });

                stack.push(operator);
			});

            stack.push(glue);
		});

		return stack;
	};

    function _deserialize(data, self) {
        var stack = [];
        var conditions = [];
        var clause;
        var subClauses = $();

        $.each(data, function(i, token) {

            if ($.isArray(token)) {

                subClauses = subClauses.add( $("<div>").addClass("sub-clause").append( _deserialize(token, self) ) );

            } else if (self._r.clauseExpressions[token]) {
                // if this is a clause token, wrap everything

				clause = self._createClause(token).find(".expr-conditions").empty().end();
                if (subClauses.length) {
				    clause.find(".expr-new-condition:first").before( subClauses );
                }

                $.each(conditions, function(i, condition) {
                    clause.find(".expr-conditions").filter(function(e) {
			            return $(this).parentsUntil(clause, "table.expr-clause").length === 0;
		            }).append( condition );
                });

                stack = [];  // reset stack
                conditions = [];

            } else if (self._r.fieldExpressions[token]) {
                // if this is a condition token
                var field;
                var params;
                $.each(stack, function(i, value) {
                    if (!field) {
                        field = [value];
                    } else {
                        if (!params) params = [];
                        params.push(value);
                    }
                });
                stack = [];  // reset stack

                conditions.push( self._clauseCondition(token, field, params) );

            } else {
                // otherwise, stack it
                stack.push(token);
            }
        });

        return clause;
    };

	function _compile(element, self) {
        // TODO : compile from serialized data instead...

		var left = null;

		element.find("table.expr-clause").filter(function (e) {
			return $(this).parentsUntil(element, ".sub-clause").length === 0;
		}).each(function (i, clause) {
			var glue = $(clause).find(".expr-select:first select").val();
			var right;

			$(clause).find(".expr-conditions").filter(function(e) {
				return $(this).parentsUntil(clause, "table.expr-clause").length === 0;
			}).find(".expr-condition").each(function (i, condition) {
				var operator = $(condition).find(".expr-operator:first select").val();
                var expr = self._r.fieldExpressions[operator];
				var values = {};

                $.each(expr.params, function(name, renderer) {
                    values[name] = self._r.paramHandlers[renderer].format.call(self, $(condition).find("[data-param-name='" + name + "']")) || "";
                });

				right = formatExpression(self._r.fieldExpressions[operator].pattern, self._r.operators, values);
				if (left) {
					left = formatExpression(self._r.clauseExpressions[glue].pattern, self._r.operators, { "@1":left, "@2":right });
				} else {
					left = right;
				}
			}).end().end().end().find(".sub-clause").filter(function(e) {
                return $(this).parentsUntil(clause, "table.expr-clause").length === 0;
            }).each(function(i, subClause) {
    			right = _compile($(subClause), self);
			    if (right) {
				    if (left) {
					    left = formatExpression(self._r.clauseExpressions[glue].pattern, self._r.operators, { "@1":left, "@2":right });
				    } else {
					    left = right;
				    }
    			}
            });

		    // wrap subClause
		    left = formatExpression(self._r.clauseExpressions[glue].wrap || self._r.defaultClauseWrap, self._r.operators, { "@1": left });
		});

		return left;
	};

	function formatExpression(pattern, operators, paramValues) {
        if (!pattern) return false;
		paramValues = paramValues || [];

		return pattern.replace(EXPRESSION_REGEX, function (g, e) {
			return operators[e];
		}).replace(PARAM_REGEX, function (g, p) {
			return paramValues[p] || "false";
		});
	};

	var t = $.uix.filterbuilder.i18n = {
		'': {
			"expr.match.all": "Match All",
			"expr.match.any": "Match Any",
			"expr.match.none": "Match.none",

			"expr.equal": "equals",
			"expr.not.equal": "not equals",
			"expr.match": "matches",
			"expr.not.match": "differs from",
			"expr.null": "is null",
			"expr.not.null": "is not null",
			"expr.between": "between (exclusive)",
			"expr.between.inc": "between (inclusive)",
			"expr.contain": "contains",
			"expr.not.contain": "does not contain",
			"expr.start.with": "starts with",
			"expr.not.start.with": "does not start with",
			"expr.end.with": "ends with",
			"expr.not.end.with": "does not end with",
			"expr.less.than": "less than",
			"expr.less.than.equal": "less than or equal to",
			"expr.greater.than": "greater than",
			"expr.greater.than.equal": "greater than or equal to",

			"btn.add": "Add",
			"btn.add.sub": "Add Sub",
			"btn.remove": "Remove",

            "param.check.field": "Field"
		}
	};

    // must define roles elsewhere
    $.uix.filterbuilder.rules = {}

})(jQuery);
