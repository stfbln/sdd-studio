# How to update this file (for people and AI assistants): a Gherkin feature (Cucumber), see
#   https://cucumber.io/docs/gherkin/reference/.
# - Purpose: Behaviour shown by concrete examples: acceptance criteria. What belongs in other files:
#   - Fields and shapes of requests, messages and commands: the API definition files.
#   - Qualities and constraints that one example cannot show (performance, availability,
#     compliance): the markdown spec of the entity.
#   - Threats and mitigations: the threat model.
# - One Feature per file, with a short description, then scenarios (optionally grouped in Rules); a
#   Background holds the steps shared by every scenario.
# - Write steps as Given (context), When (action), Then (expected outcome), with And or But to
#   continue; reuse the wording of existing steps.
# - A Scenario Outline uses <placeholders> filled by its Examples tables; keep table columns
#   aligned.
# - Tags (@name) go on the line above a Feature, Rule, Scenario or Examples. When the first line is
#   "# language: xx", use the keywords of that language.
# - Keep this header and the existing comments.
@shop
Feature: Buying cucumbers
  As a customer
  I want to buy cucumbers
  So that I can make a salad

  Background:
    Given the shop is open
    And I am hungry

  Scenario Outline: Eating cucumbers
    Given there are <start> cucumbers
    When I eat <eat> cucumbers
    Then I should have <left> cucumbers

    Examples: Few
      | start | eat | left |
      | 12    | 5   | 7    |
      | 20    | 5   | 15   |

  @payment
  Scenario Outline: Paying
    Given my basket contains <count> cucumbers
    When I pay with a <card> credit card
    Then the receipt says
      """json
      {"total": <amount>}
      """

    Examples:
      | count | card | amount |
      | 3     | VISA | 3.03   |
      | 6     | VISA | 6.06   |
      | 10    | VISA | 10.10  |
